// backend/src/services/asistencia.sse.js
import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

// === Clientes SSE conectados ===
const clients = new Set(); // cada item: { id, res, user }
let nextId = 1;

// === ENV ===
const JWT_SECRET = process.env.JWT_SECRET || "secret123"; // mismo que usas en auth.routes.js
const HEARTBEAT_MS = 25_000;

/** Verifica token JWT pasado por query (?auth=...) */
function authByQuery(req, res, next) {
  const tok = String(req.query.auth || "");
  if (!tok) return res.status(401).end();
  try {
    const payload = jwt.verify(tok, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (_) {
    return res.status(401).end();
  }
}

/** Formato SSE */
function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

/** Enviar evento SSE */
function sendEvent(res, type, data) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Heartbeat para que proxies no cierren la conexión */
function startHeartbeat(res) {
  const t = setInterval(() => {
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);
  return () => clearInterval(t);
}

// ========= Endpoint de stream =========
router.get("/asistencia/stream", authByQuery, (req, res) => {
  res.writeHead(200, sseHeaders());

  const id = nextId++;
  const stopHB = startHeartbeat(res);
  const client = { id, res, user: req.user };
  clients.add(client);

  // bienvenida opcional
  sendEvent(res, "ready", { ok: true, now: Date.now() });

  req.on("close", () => {
    stopHB();
    clients.delete(client);
  });
});

// ========= Broadcaster =========
export function broadcastAsistencia(payload) {
  if (!clients.size) return;
  for (const c of clients) {
    try {
      sendEvent(c.res, "asistencia", payload);
    } catch {}
  }
}

export default router;
