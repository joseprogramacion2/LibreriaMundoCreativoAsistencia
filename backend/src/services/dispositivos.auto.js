// src/services/dispositivos.auto.js
import prisma from "../db/prisma.js";

/* ====== Helpers locales ====== */
async function getZK() {
  const mod = await import("node-zklib");
  return mod.default || mod;
}
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
        "LogTime" in v ||
        "logTime" in v ||
        "checkTime" in v ||
        "CheckTime" in v)
  );
  return guess.length ? guess : [];
}
function extractUserId(a) {
  const cand = [
    a.userId,
    a.uid,
    a.user,
    a.UserID,
    a.USERID,
    a.UserId,
    a.enrollNumber,
    a.EnrollNumber,
    a.ENROLLNUMBER,
    a.pin,
    a.PIN,
    a.empId,
    a.employeeId,
    a.EmpId,
    a.deviceUserId,
  ];
  for (const v of cand)
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  return "";
}
function extractRecordId(a) {
  const cand = [a.id, a.sn, a.SN, a.LogId, a.logId, a.RecordId, a.recordId, a.userSn];
  for (const v of cand) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function extractRawTimestamp(a) {
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

// Reintento con backoff para llamadas Prisma que no deben tumbar la app
async function prismaSafe(fn, { tag = "db", retries = 2, delay = 500 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (e) {
      console.warn(`[${tag}] intento ${i + 1}/${retries + 1} →`, e?.code || e?.message || e);
      if (i === retries) return null;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  return null;
}

/* ====== Config ====== */
const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS || 15000); // 15s
const RT_ENABLED = String(process.env.ZK_RT_ENABLED || "1") === "1"; // activado por defecto

/* ====== Estado en memoria ====== */
const _workers = new Map(); // deviceId -> { stop() }

/* ====== Inserta asistencias y actualiza punteros ====== */
async function upsertEventosPara(d, logs) {
  const empleados =
    (await prismaSafe(
      () =>
        prisma.empleado.findMany({
          where: { sucursalId: d.sucursalId, activo: true },
          select: { id: true, userIdDispositivo: true },
        }),
      { tag: "empleado.findMany" }
    )) || [];

  const byUserId = new Map(empleados.map((e) => [String(e.userIdDispositivo ?? ""), e.id]));

  let maxLogId = d.ultimoUserSn ?? 0;
  let maxUnix = d.ultimoEventoUnix ?? 0;

  let insertados = 0;
  for (const a of logs) {
    const relojUserId = extractUserId(a);
    if (!relojUserId) continue;

    const empId = byUserId.get(relojUserId);
    if (!empId) continue;

    const localTs = parseLocalTs(a);
    if (!localTs) continue;

    const deviceUnix = Math.floor(localTs.getTime() / 1000);
    const deviceUserSn = extractRecordId(a);

    // Filtro por punteros (evita duplicados)
    const byTime = d.ultimoEventoUnix ? deviceUnix > d.ultimoEventoUnix : true;
    const byId = deviceUserSn != null ? (d.ultimoUserSn ? deviceUserSn > d.ultimoUserSn : true) : false;
    if (!(byTime || byId)) continue;

    try {
      await prismaSafe(
        () =>
          prisma.asistenciaEvento.create({
            data: {
              empleadoId: empId,
              dispositivoId: d.id,
              deviceUnix,
              deviceUserSn, // puede ser null
              timestampUTC: localTs, // guardamos tal cual
              tipo: "FICHAJE",
              crudo: JSON.stringify(a),
            },
          }),
        { tag: "asistenciaEvento.create" }
      );
      insertados++;
      if (deviceUserSn && deviceUserSn > maxLogId) maxLogId = deviceUserSn;
      if (deviceUnix > maxUnix) maxUnix = deviceUnix;
    } catch (e) {
      const msg = String(e?.message || "");
      if (!msg.includes("Unique")) console.error("Insert evento error:", e);
    }
  }

  if (insertados > 0 && (maxLogId !== d.ultimoUserSn || maxUnix !== d.ultimoEventoUnix)) {
    await prismaSafe(
      () =>
        prisma.dispositivo.update({
          where: { id: d.id },
          data: { ultimoUserSn: maxLogId, ultimoEventoUnix: maxUnix },
        }),
      { tag: "dispositivo.update" }
    );
  }
  return insertados;
}

/* ====== Ciclo de polling ====== */
async function pollingLoop(d, stopToken) {
  const ZKLib = await getZK();
  const zk = new ZKLib(d.ip, Number(d.puerto || 4370), 10000, 4000);
  try {
    await zk.createSocket();
  } catch (e) {
    console.warn(`[${d.nombre}] No conecta (polling):`, e?.message || e);
    return; // reintento en siguiente vuelta
  }

  try {
    const raw = await zk.getAttendances().catch(() => null);
    const all = normalizeLogs(raw);
    if (all.length) {
      const fresh = await prismaSafe(
        () => prisma.dispositivo.findUnique({ where: { id: d.id } }),
        { tag: "dispositivo.findUnique(polling)" }
      );
      if (!fresh) return;
      await upsertEventosPara(fresh, all);
    }
  } finally {
    try { await zk.disconnect(); } catch {}
  }
}

/* ====== Suscripción de tiempo real con fallback a polling ====== */
async function realtimeWorker(d, stopToken) {
  const ZKLib = await getZK();
  const zk = new ZKLib(d.ip, Number(d.puerto || 4370), 10000, 4000);

  let intervalId = null;

  const startPolling = () => {
    if (intervalId) return;
    intervalId = setInterval(async () => {
      if (stopToken.stopped) return;
      const dev = await prismaSafe(
        () => prisma.dispositivo.findUnique({ where: { id: d.id } }),
        { tag: "dispositivo.findUnique(timer)" }
      );
      if (!dev?.activo) return;
      await pollingLoop(dev, stopToken);
    }, INTERVAL_MS);
  };

  const stopAll = async () => {
    stopToken.stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    try { await zk.disconnect(); } catch {}
  };

  // Guardamos para stop externo
  _workers.set(d.id, { stop: stopAll });

  // Si no queremos RT, solo polling
  if (!RT_ENABLED) {
    startPolling();
    return;
  }

  try {
    await zk.createSocket();
    if (typeof zk.getRealTimeLogs !== "function") {
      console.warn(`[${d.nombre}] La lib/firmware no expone getRealTimeLogs(); usando polling`);
      await zk.disconnect();
      startPolling();
      return;
    }

    console.log(`[${d.nombre}] Suscrito a tiempo real…`);
    zk.getRealTimeLogs(async (data) => {
      if (stopToken.stopped) return;
      try {
        const fresh = await prismaSafe(
          () => prisma.dispositivo.findUnique({ where: { id: d.id } }),
          { tag: "dispositivo.findUnique(RT)" }
        );
        if (!fresh) return;

        const logs = normalizeLogs(data);
        const arr = Array.isArray(logs) ? logs : [logs].filter(Boolean);
        await upsertEventosPara(fresh, arr);
      } catch (e) {
        console.error(`[${d.nombre}] Error al procesar RT:`, e?.message || e);
      }
    });

    // Red de seguridad: polling
    startPolling();
  } catch (e) {
    console.warn(`[${d.nombre}] Falló RT (${e?.message || e}); usando polling`);
    try { await zk.disconnect(); } catch {}
    startPolling();
  }
}

/* ====== API pública del servicio ====== */
export async function startAutoSync() {
  const activos =
    (await prismaSafe(() => prisma.dispositivo.findMany({ where: { activo: true } }), {
      tag: "dispositivo.findMany(activos)",
    })) || [];
  for (const d of activos) {
    if (_workers.has(d.id)) continue;
    const stopToken = { stopped: false };
    realtimeWorker(d, stopToken); // no await
  }
  console.log(`Auto-sync iniciado para ${activos.length} dispositivo(s).`);
}

export async function restartAutoSyncForDevice(deviceId) {
  await stopAutoSyncForDevice(deviceId);
  const d = await prismaSafe(() => prisma.dispositivo.findUnique({ where: { id: deviceId } }), {
    tag: "dispositivo.findUnique(restart)",
  });
  if (d?.activo) {
    const stopToken = { stopped: false };
    realtimeWorker(d, stopToken);
  }
}

export async function stopAutoSyncForDevice(deviceId) {
  const w = _workers.get(deviceId);
  if (w) {
    await w.stop();
    _workers.delete(deviceId);
  }
}

export async function stopAllAutoSync() {
  for (const [id, w] of _workers.entries()) {
    await w.stop();
    _workers.delete(id);
  }
}
