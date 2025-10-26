// backend/src/routes/ingest.js
import { Router } from "express";
import prisma from "../db/prisma.js";

const router = Router();

/** ✅ Solo esta ruta requiere token */
function tokenCheck(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token !== process.env.INGEST_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * Espera un array de eventos:
 * [{ deviceIP, userIdDispositivo, timestampUTC, sucursalId?, raw }]
 */
router.post("/asistencia/ingest", tokenCheck, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) {
      return res.json({ ok: true, inserted: 0, skipped: 0, dup: 0 });
    }

    let inserted = 0, skipped = 0, dup = 0;

    // Cache dispositivos por IP (incluye sucursalId)
    const allDisps = await prisma.dispositivo.findMany({
      select: { id: true, ip: true, sucursalId: true },
    });
    const byIP = new Map(allDisps.map(d => [String(d.ip).trim(), d]));

    for (const it of items) {
      try {
        const deviceIP = String(it.deviceIP || "").trim();
        const device = byIP.get(deviceIP);
        if (!device) {
          // reloj desconocido → saltamos
          skipped++;
          continue;
        }

        const uid = Number(it.userIdDispositivo);
        if (!Number.isFinite(uid) || uid <= 0) { skipped++; continue; }

        const ts = new Date(it.timestampUTC);
        if (isNaN(ts.getTime())) { skipped++; continue; }

        // 👇 Filtrar empleado por userIdDispositivo **y** sucursal del reloj
        const emp = await prisma.empleado.findFirst({
          where: {
            userIdDispositivo: uid,
            sucursalId: device.sucursalId,
            // opcional: solo activos
            // activo: true,
          },
          select: { id: true },
        });

        if (!emp) {
          // No hay mapeo en esa sucursal → lo registramos como “skipped”
          // (si quieres, aquí podrías crear una “bandeja de pendientes de mapear”)
          skipped++;
          continue;
        }

        await prisma.asistenciaEvento.create({
          data: {
            empleadoId: emp.id,
            dispositivoId: device.id,
            timestampUTC: ts,
            deviceUnix: Math.floor(ts.getTime() / 1000),
            deviceUserSn: uid, // o el correlativo del log si lo mandas
            crudo: it.raw ? JSON.stringify(it.raw) : null,
            // tipo: "FICHAJE", // si tu schema lo tiene
          },
        });

        inserted++;
      } catch (e) {
        // Duplicado (si tienes unique en (empleadoId, dispositivoId, timestampUTC) por ejemplo)
        if (e?.code === "P2002") { dup++; continue; }
        skipped++;
      }
    }

    return res.json({ ok: true, inserted, skipped, dup });
  } catch (e) {
    console.error("ingest error:", e);
    return res.status(500).json({ error: "ingest failed" });
  }
});

export default router;
