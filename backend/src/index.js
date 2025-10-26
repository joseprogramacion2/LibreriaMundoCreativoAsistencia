// src/index.js
process.env.TZ = "America/Guatemala";
console.log("🕓 Zona horaria fijada en:", process.env.TZ);

import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

import prisma from "./db/prisma.js";

import authRoutes from "./routes/auth.routes.js";
import sucursalesRoutes from "./routes/sucursales.routes.js";
import dispositivosRoutes from "./routes/dispositivos.routes.js";
import empleadosRoutes from "./routes/empleados.routes.js";
import turnosRoutes from "./routes/turnos.routes.js";
import asistenciaRoutes from "./routes/asistencia.routes.js";
import chatRouter from "./routes/chat.js";
import ingest from "./routes/ingest.js";
import { startAutoSync, stopAllAutoSync } from "./services/dispositivos.auto.js";

// Rutas ESM adicionales
import mlRoutes from "./routes/ml.routes.js";
import nominaRoutes from "./routes/nomina.routes.js";
import empleadosSalarioRoutes from "./routes/empleados.salario.routes.js";
import permisosRoutes from "./routes/permisos.routes.js";
import rolesRoutes from "./routes/roles.routes.js";

// ⬇️ CAMBIO: nuevo verificador
import { verifyEmailTransport } from './services/email.js';

const app = express();

const ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: ORIGINS.length ? ORIGINS : true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/", (_req, res) => res.json({ ok: true, name: "API Asistencia" }));

// Hooks externos
app.use("/hook", ingest);

// Rutas API
app.use("/auth", authRoutes);
app.use("/sucursales", sucursalesRoutes);
app.use("/dispositivos", dispositivosRoutes);
app.use("/empleados", empleadosRoutes);
app.use("/turnos", turnosRoutes);
app.use("/asistencia", asistenciaRoutes);
app.use("/chat", chatRouter);

// Nómina / salarios
app.use("/nomina", nominaRoutes);
app.use("/empleados", empleadosSalarioRoutes);

// Permisos / roles
app.use("/permisos", permisosRoutes);
app.use("/roles", rolesRoutes);

// ML (predicción/puntuales)
app.use("/ml", mlRoutes);

// ⬇️ CAMBIO: verificación email provider al arrancar
verifyEmailTransport();

// ---------- Paracaídas globales (no tumbar el proceso) ----------
process.on("unhandledRejection", (e) =>
  console.error("[unhandledRejection]", e)
);
process.on("uncaughtException", (e) =>
  console.error("[uncaughtException]", e)
);

// ========= Arranque =========
const PORT = process.env.PORT || 3001;

(async () => {
  try {
    await prisma.$connect();
  } catch (e) {
    console.error("❌ No se pudo conectar a Postgres al inicio:", e?.code || e?.message || e);
  }

  app.listen(PORT, async () => {
    console.log("API en puerto", PORT);
    try {
      await startAutoSync();
    } catch (e) {
      console.error("No se pudo iniciar el auto-sync:", e?.message || e);
    }
  });
})();

// ========= Apagado limpio =========
async function gracefulShutdown(signal) {
  console.log(`\nRecibido ${signal}. Cerrando...`);
  try { await stopAllAutoSync(); } catch {}
  try { await prisma.$disconnect(); } catch {}
  process.exit(0);
}
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
