// backend/src/routes/dispositivos.routes.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/** Import dinámico para no crashear si falta el paquete al boot */
async function getZK() {
  const mod = await import("node-zklib");
  return mod.default || mod;
}
async function connectDevice(ip, port = 4370) {
  const ZKLib = await getZK();
  const zk = new ZKLib(ip, Number(port), 10000, 4000);
  await zk.createSocket(); // UDP 4370
  return zk;
}

/** Normaliza cualquier respuesta de getAttendances() a un array de logs */
function normalizeLogs(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (res.data && Array.isArray(res.data.attendance)) return res.data.attendance;
  if (Array.isArray(res.attendances)) return res.attendances;
  const vals = Object.values(res || {});
  const guess = vals.filter(
    v =>
      v &&
      typeof v === "object" &&
      ("timestamp" in v ||
        "time" in v ||
        "recordTime" in v ||
        "attTime" in v ||
        "attendanceTime" in v ||
        "LogTime" in v)
  );
  return guess.length ? guess : [];
}

/* ================= Helpers robustos ================= */
// 👉 REEMPLAZA ESTAS DOS FUNCIONES
function extractUserId(a) {
  // userId del empleado (el PIN)
  const cand = [
    a.userId, a.uid, a.user,
    a.UserID, a.USERID, a.UserId,
    a.enrollNumber, a.EnrollNumber, a.ENROLLNUMBER,
    a.pin, a.PIN,
    a.empId, a.employeeId, a.EmpId,
    a.deviceUserId, // 👈 TU CASO
  ];
  for (const v of cand) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function extractRecordId(a) {
  // consecutivo del log en el reloj
  const cand = [
    a.id, a.sn, a.SN, a.LogId, a.logId, a.RecordId, a.recordId,
    a.userSn, // 👈 TU CASO
  ];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function extractRawTimestamp(a) {
  // contemplar más variantes
  return (
    a.timestamp ??
    a.recordTime ??
    a.time ??
    a.attTime ??
    a.attendanceTime ??
    a.LogTime ??
    a.logTime ??
    a.checkTime ??
    a.CheckTime ??
    null
  );
}

function parseLocalTs(a) {
  const rawTs = extractRawTimestamp(a);
  const dt = new Date(rawTs);
  return isNaN(dt) ? null : dt;
}

/* ===================== CRUD BÁSICO ===================== */
router.get("/", async (_req, res) => {
  const rows = await prisma.dispositivo.findMany({
    include: { sucursal: true },
    orderBy: { id: "desc" },
  });
  res.json(rows);
});

router.post("/", async (req, res) => {
  const {
    nombre,
    modelo,
    ip,
    puerto = 4370,
    numeroSerie = null,
    sucursalId,
    activo = true,
  } = req.body;

  const created = await prisma.dispositivo.create({
    data: {
      nombre: nombre?.trim(),
      modelo: modelo?.trim(),
      ip: ip?.trim(),
      puerto: Number(puerto),
      numeroSerie: numeroSerie?.trim() || null,
      sucursalId: Number(sucursalId),
      activo: !!activo,
    },
  });
  res.json(created);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const data = { ...req.body };
  if (data.puerto != null) data.puerto = Number(data.puerto);
  if (data.sucursalId != null) data.sucursalId = Number(data.sucursalId);
  if (data.ultimoUserSn != null) data.ultimoUserSn = Number(data.ultimoUserSn);
  if (data.ultimoEventoUnix != null)
    data.ultimoEventoUnix = Number(data.ultimoEventoUnix);
  const updated = await prisma.dispositivo.update({ where: { id }, data });
  res.json(updated);
});

/* ===================== PROBAR CONEXIÓN ===================== */
router.post("/:id/test", async (req, res) => {
  const id = Number(req.params.id);
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d)
    return res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Dispositivo no encontrado" });

  function mapError(e) {
    const code = e?.code || e?.err?.code || "";
    // Normalizamos algunos errores típicos de red/puerto
    if (code === "ETIMEDOUT") return { code: "TIMEOUT", reason: "No respondió (posible apagado o filtro de red/puerto)" };
    if (code === "ECONNREFUSED") return { code: "REFUSED", reason: "Conexión rechazada (puerto cerrado o equipo no escucha)" };
    if (code === "EHOSTUNREACH") return { code: "UNREACHABLE", reason: "Host inalcanzable (ruta o VLAN/ACL)" };
    if (code === "ENETUNREACH") return { code: "UNREACHABLE", reason: "Red inalcanzable" };
    if (code === "EAI_AGAIN") return { code: "DNS", reason: "Resolución DNS temporal fallida" };
    // node-zklib a veces envuelve: e.err?.ip / e.command etc.
    return { code: "UNKNOWN", reason: String(e?.message || "Fallo desconocido") };
  }

  let zk;
  try {
    zk = await connectDevice(d.ip, d.puerto);
    const info = await zk.getInfo?.().catch(() => null);
    await zk.disconnect();
    return res.json({
      ok: true,
      reachable: true,
      message: "Conexión OK",
      ip: d.ip,
      puerto: d.puerto,
      info,
    });
  } catch (e) {
    try { if (zk) await zk.disconnect(); } catch {}
    const m = mapError(e);
    // 504 sugiere timeout; 502/503/500 para otros
    const status = m.code === "TIMEOUT" ? 504 :
                   m.code === "REFUSED" ? 502 :
                   m.code === "UNREACHABLE" ? 503 : 500;
    return res.status(status).json({
      ok: false,
      reachable: false,
      code: m.code,
      message: m.reason,
      ip: d.ip,
      puerto: d.puerto,
    });
  }
});

/* ===================== HORA DEL DISPOSITIVO (opcional) ===================== */
router.get("/:id/time", async (req, res) => {
  const id = Number(req.params.id);
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d) return res.status(404).json({ ok:false, message:"Dispositivo no encontrado" });

  let zk;
  try {
    zk = await connectDevice(d.ip, d.puerto);
    const nowDevice = (await zk.getTime?.()) || null;
    await zk.disconnect();
    res.json({ ok:true, deviceTime: nowDevice, serverTime: new Date().toISOString() });
  } catch (e) {
    try { if (zk) await zk.disconnect(); } catch {}
    res.status(500).json({ ok:false, message:"No se pudo leer hora del dispositivo" });
  }
});

router.post("/:id/set-time", async (req, res) => {
  const id = Number(req.params.id);
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d) return res.status(404).json({ ok:false, message:"Dispositivo no encontrado" });

  let zk;
  try {
    zk = await connectDevice(d.ip, d.puerto);
    const now = new Date();
    if (typeof zk.setTime === "function") {
      await zk.setTime(now);
    } else if (zk.setDeviceTime) {
      await zk.setDeviceTime(now);
    } else {
      throw new Error("La librería no expone método para setear hora");
    }
    await zk.disconnect();
    res.json({ ok:true, message:"Hora del dispositivo actualizada", serverTime: now.toISOString() });
  } catch (e) {
    try { if (zk) await zk.disconnect(); } catch {}
    res.status(500).json({ ok:false, message: String(e?.message || e) });
  }
});

/* ===================== VER UNA MUESTRA DE LOGS ===================== */
router.get("/:id/logs/peek", async (req, res) => {
  const id = Number(req.params.id);
  const limit = Number(req.query.limit || 10);
  const debug = String(req.query.debug || "") === "1";
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d)
    return res
      .status(404)
      .json({ ok: false, message: "Dispositivo no encontrado" });

  let zk;
  try {
    zk = await connectDevice(d.ip, d.puerto);
    const raw = await zk.getAttendances();
    await zk.disconnect();

    const logs = normalizeLogs(raw);
    const tail = logs.slice(-limit);

    const mapped = tail.map((a) => {
      const t = parseLocalTs(a);
      return {
        id: extractRecordId(a),
        userId: extractUserId(a),
        timestamp: t ? t.toISOString() : null,
        ...(debug
          ? {
              keys: Object.keys(a),
              rawPreview: JSON.stringify(a).slice(0, 300) // para inspección
            }
          : {}),
      };
    });

    return res.json({
      ok: true,
      ip: d.ip,
      puerto: d.puerto,
      totalLeidos: logs.length,
      sample: mapped,
      punteros: {
        ultimoUserSn: d.ultimoUserSn ?? 0,
        ultimoEventoUnix: d.ultimoEventoUnix ?? 0,
      },
    });
  } catch (e) {
    try {
      if (zk) await zk.disconnect();
    } catch {}
    console.error("peek error:", e);
    return res.status(500).json({ ok: false, message: "No se pudo leer logs" });
  }
});

/* ===================== RESETEAR PUNTEROS ===================== */
router.post("/:id/reset-pointers", async (req, res) => {
  const id = Number(req.params.id);
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d)
    return res
      .status(404)
      .json({ ok: false, message: "Dispositivo no encontrado" });

  await prisma.dispositivo.update({
    where: { id },
    data: { ultimoUserSn: 0, ultimoEventoUnix: 0 },
  });
  res.json({ ok: true, message: "Punteros reseteados a 0" });
});

/* ===================== SINCRONIZAR LOGS ===================== */
/**
 * POST /dispositivos/:id/sync
 * Lee asistencias y las guarda en AsistenciaEvento.
 * ?full=1 -> ignora punteros y trae TODO
 */
router.post("/:id/sync", async (req, res) => {
  const id = Number(req.params.id);
  const { full } = req.query;
  const d = await prisma.dispositivo.findUnique({ where: { id } });
  if (!d)
    return res
      .status(404)
      .json({ ok: false, message: "Dispositivo no encontrado" });

  const punterosAntes = {
    ultimoUserSn: d.ultimoUserSn ?? 0,
    ultimoEventoUnix: d.ultimoEventoUnix ?? 0,
  };

  let zk;
  let insertados = 0;
  const descartes = { porPuntero: 0, sinTimestamp: 0, sinMapa: 0, sinUserId: 0 };

  try {
    zk = await connectDevice(d.ip, d.puerto);
    const raw = await zk.getAttendances();
    await zk.disconnect();

    const allLogs = normalizeLogs(raw);

    let candidatos = allLogs;
    if (!full) {
      candidatos = allLogs.filter((a) => {
        const t = parseLocalTs(a);
        const ts = t ? Math.floor(t.getTime() / 1000) : null;
        const recId = extractRecordId(a);

        if (ts == null && recId == null) {
          descartes.sinTimestamp++;
          return false;
        }

        const byTime =
          ts != null ? (d.ultimoEventoUnix ? ts > d.ultimoEventoUnix : true) : false;
        const byId =
          recId != null ? (d.ultimoUserSn ? recId > d.ultimoUserSn : true) : false;

        const ok = byTime || byId;
        if (!ok) descartes.porPuntero++;
        return ok;
      });
    }

    const empleados = await prisma.empleado.findMany({
      where: { sucursalId: d.sucursalId, activo: true },
      select: { id: true, userIdDispositivo: true, codigo: true, nombre: true, apellido: true },
    });
    const byUserId = new Map(empleados.map(e => [String(e.userIdDispositivo ?? ""), e.id]));

    let maxLogId = d.ultimoUserSn ?? 0;
    let maxUnix = d.ultimoEventoUnix ?? 0;

    const userIdsVistos = new Set();

    for (const a of candidatos) {
      const relojUserId = extractUserId(a);
      if (!relojUserId) { descartes.sinUserId++; continue; }
      userIdsVistos.add(relojUserId);

      const empleadoId = byUserId.get(relojUserId);
      if (!empleadoId) { descartes.sinMapa++; continue; }

      const localTs = parseLocalTs(a);
      if (!localTs) { descartes.sinTimestamp++; continue; }

      const utcTs = localTs; // NO aplicar +6h
      const deviceUnix = Math.floor(localTs.getTime() / 1000);
      const deviceUserSn = extractRecordId(a);

      try {
        await prisma.asistenciaEvento.create({
          data: {
            empleadoId,
            dispositivoId: d.id,
            deviceUnix,
            deviceUserSn, // puede ser null
            timestampUTC: utcTs,
            tipo: "FICHAJE",
            crudo: JSON.stringify(a),
          },
        });
        insertados++;
        if (deviceUserSn && deviceUserSn > maxLogId) maxLogId = deviceUserSn;
        if (deviceUnix > maxUnix) maxUnix = deviceUnix;
      } catch (e) {
        const msg = String(e?.message || "");
        if (!msg.includes("Unique")) console.error("Insert evento error:", e);
      }
    }

    await prisma.dispositivo.update({
      where: { id: d.id },
      data: { ultimoUserSn: maxLogId, ultimoEventoUnix: maxUnix },
    });

    const punterosDespues = { ultimoUserSn: maxLogId, ultimoEventoUnix: maxUnix };

    return res.json({
      ok: true,
      ip: d.ip,
      punterosAntes,
      punterosDespues,
      totalLeidos: allLogs.length,
      considerados: candidatos.length,
      insertados,
      descartes,
      userIdsVistos: Array.from(userIdsVistos).slice(0, 20),
    });
  } catch (e) {
    try { if (zk) await zk.disconnect(); } catch {}
    console.error("ZK sync error:", e);
    return res.status(500).json({ ok: false, message: "Fallo sincronización" });
  }
});

export default router;
