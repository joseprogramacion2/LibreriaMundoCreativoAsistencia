// backend/src/routes/ingest.js
import { Router } from "express";
import prisma from "../db/prisma.js";   // <— usa tu singleton

const router = Router();

/** ✅ Middleware SOLO para la ruta que lo requiere */
function tokenCheck(req, res, next) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token !== process.env.INGEST_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/**
 * Espera un array de eventos:
 * [{ deviceIP, userIdDispositivo, timestampUTC, sucursalId, raw }]
 */
router.post("/asistencia/ingest", tokenCheck, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) {
      return res.json({ ok: true, inserted: 0, skipped: 0, dup: 0 });
    }

    let inserted = 0, skipped = 0, dup = 0;

    // Cache de dispositivos por IP
    const allDisps = await prisma.dispositivo.findMany({
      select: { id: true, ip: true, sucursalId: true },
    });
    const findDisp = (ip) =>
      allDisps.find((x) => String(x.ip).trim() === String(ip).trim()) || null;

    for (const it of items) {
      try {
        const device = findDisp(it.deviceIP);
        if (!device) { skipped++; continue; }

        // Buscar empleado por userIdDispositivo
        const emp = await prisma.empleado.findFirst({
          where: { userIdDispositivo: Number(it.userIdDispositivo) || -1 },
          select: { id: true },
        });
        if (!emp) { skipped++; continue; }

        const ts = new Date(it.timestampUTC);
        if (isNaN(ts.getTime())) { skipped++; continue; }

        await prisma.asistenciaEvento.create({
          data: {
            empleadoId: emp.id,
            dispositivoId: device.id,
            timestampUTC: ts,
            deviceUnix: Math.floor(ts.getTime() / 1000),
            deviceUserSn: Number(it.userIdDispositivo) || null,
            crudo: it.raw ? JSON.stringify(it.raw) : null,
          },
        });
        inserted++;
      } catch (e) {
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
