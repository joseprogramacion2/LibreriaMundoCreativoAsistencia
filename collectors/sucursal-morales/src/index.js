import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import cron from "node-cron";
import ZKLib from "node-zklib";

const {
  API_URL,
  API_TOKEN,
  DEVICE_IP,
  DEVICE_PORT = 4370,
  DISPOSITIVO_ID,
  CRON = "*/1 * * * *",
} = process.env;

if (!API_URL || !DEVICE_IP || !DISPOSITIVO_ID) {
  console.error("Faltan variables en .env (API_URL, DEVICE_IP, DISPOSITIVO_ID).");
  process.exit(1);
}

function toUnixSec(v) {
  try {
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return 0;
      return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
    }
    if (typeof v === "string") {
      // ISO (tu caso): "2025-09-05T00:46:05.000Z"
      let d = new Date(v);
      if (!isNaN(d)) return Math.floor(d.getTime() / 1000);

      // "YYYY-MM-DD HH:mm:ss"
      d = new Date(v.replace(" ", "T"));
      if (!isNaN(d)) return Math.floor(d.getTime() / 1000);

      // "DD/MM/YYYY HH:mm:ss" o "DD-MM-YYYY HH:mm:ss"
      const m = v.match(
        /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/
      );
      if (m) {
        const [, dd, MM, yyyy, hh, mm, ss] = m;
        const d2 = new Date(
          `${yyyy}-${MM.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh}:${mm}:${ss}`
        );
        if (!isNaN(d2)) return Math.floor(d2.getTime() / 1000);
      }
    }
  } catch {}
  return 0;
}

async function getCursor() {
  try {
    const { data } = await axios.get(`${API_URL}/dispositivos/${DISPOSITIVO_ID}`);
    return {
      unix: Number(data?.data?.ultimoEventoUnix || 0),
      sn: Number(data?.data?.ultimoUserSn || 0) // <-- NUEVO
    };
  } catch {
    return { unix: 0, sn: 0 };
  }
}

async function pushEvento(ev) {
  return axios.post(`${API_URL}/asistencia/evento`, ev, {
    headers: {
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      "Content-Type": "application/json"
    },
    timeout: 15000
  });
}

/** Adapta cualquier formato de log a nuestro evento */
function mapLogToEvent(log) {
  // Posibles nombres de campos según librería/firmware:
  const userRaw =
    log?.deviceUserId ??
    log?.userId ??
    log?.uid ??
    log?.enrollNumber ??
    log?.user ??
    null;

  const timeRaw =
    log?.recordTime ??
    log?.timestamp ??
    log?.attTime ??
    log?.time ??
    log?.dateTime ??
    null;

  const userSnRaw = log?.userSn ?? log?.sn ?? null; // <-- NUEVO

  const userIdDispositivo = Number(userRaw);
  const deviceUnix = toUnixSec(timeRaw);
  const deviceUserSn = Number(userSnRaw);

  return {
    userIdDispositivo: Number.isFinite(userIdDispositivo) ? userIdDispositivo : null,
    dispositivoId: Number(DISPOSITIVO_ID),
    deviceUnix,
    deviceUserSn: Number.isFinite(deviceUserSn) ? deviceUserSn : null, // <-- NUEVO
    crudo: log
  };
}

async function pullAndSend() {
  let zk;
  try {
    console.log(`[${new Date().toISOString()}] Conectando a K14 ${DEVICE_IP}:${DEVICE_PORT}...`);
    zk = new ZKLib(DEVICE_IP, Number(DEVICE_PORT), 10000, 4000);
    await zk.createSocket();

    try { await zk.disableDevice(); } catch {}
    const logs = await zk.getAttendances();
    try { await zk.enableDevice(); } catch {}

    const data = Array.isArray(logs?.data) ? logs.data : [];
    console.log(`Leídos ${data.length} registros del dispositivo.`);

    const cursor = await getCursor();

    const eventos = data
      .map(mapLogToEvent)
      .filter(e => e.userIdDispositivo !== null && e.deviceUnix > 0)
      .sort((a, b) =>
        (a.deviceUserSn ?? 0) - (b.deviceUserSn ?? 0) || a.deviceUnix - b.deviceUnix
      );

    // Debug: muestra parseo
    console.log(
      "Sample parse:",
      eventos.slice(0, 3).map(e => ({
        userId: e.userIdDispositivo,
        ts: e.deviceUnix,
        sn: e.deviceUserSn ?? null
      }))
    );

    // Filtro: prioriza userSn; si no hay, usa tiempo
    const nuevos = eventos.filter(e => {
      if (e.deviceUserSn) return e.deviceUserSn > cursor.sn;
      return e.deviceUnix > cursor.unix;
    });

    console.log(`Nuevos a enviar: ${nuevos.length} (cursorUnix=${cursor.unix}, cursorSn=${cursor.sn}).`);

    let ok = 0, fail = 0;
    for (const ev of nuevos) {
      try {
        await pushEvento(ev);
        ok++;
      } catch (e) {
        fail++;
        console.log("Fallo publicando evento:", e.response?.data || e.message);
      }
    }

    console.log(`Envío terminado. OK=${ok}, FAIL=${fail}.`);
  } catch (e) {
    console.error("Error del colector:", e.message);
  } finally {
    try { await zk?.disconnect(); } catch {}
  }
}

console.log("Colector K14 sucursal-morales iniciado.");
// Ejecuta ahora
pullAndSend();
// Programa ejecución periódica
cron.schedule(CRON, pullAndSend);
