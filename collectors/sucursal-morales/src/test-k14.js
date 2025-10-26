import dotenv from "dotenv";
dotenv.config();
import ZKLib from "node-zklib";

const { DEVICE_IP, DEVICE_PORT = 4370 } = process.env;

(async () => {
  let zk;
  try {
    console.log(`Probando conexión a ${DEVICE_IP}:${DEVICE_PORT} ...`);
    zk = new ZKLib(DEVICE_IP, Number(DEVICE_PORT), 10000, 4000);
    await zk.createSocket();

    const info = await zk.getInfo();
    console.log("Info dispositivo:", info);

    const logs = await zk.getAttendances();
    const arr = Array.isArray(logs?.data) ? logs.data : [];
    console.log("Cantidad de registros:", arr.length);

    // 👇 imprime los primeros 5 para ver su estructura real
    console.log("MUESTRA DE LOGS:");
    console.log(JSON.stringify(arr.slice(0, 5), null, 2));
  } catch (e) {
    console.error("No se pudo conectar al K14:", e.message);
  } finally {
    try { await zk?.disconnect(); } catch {}
  }
})();
