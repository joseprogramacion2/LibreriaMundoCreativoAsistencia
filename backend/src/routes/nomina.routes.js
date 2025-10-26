// backend/src/routes/nomina.routes.js  (ESM)
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { calcularPeriodo } from "../services/nomina.calculo.js";

const prisma = new PrismaClient();
const router = Router();

// Middleware requireAuth opcional
let requireAuth = (_req, _res, next) => next();
try {
  const m = await import("../middlewares/requireAuth.js");
  if (typeof m.default === "function") requireAuth = m.default;
} catch {}

/** Crear período */
router.post("/periodos", requireAuth, async (req, res) => {
  try {
    const { nombre, inicio, fin, horasMeta = 160 } = req.body || {};
    if (!nombre || !inicio || !fin) {
      return res
        .status(400)
        .json({ error: "nombre, inicio y fin son obligatorios" });
    }
    const per = await prisma.periodoNomina.create({
      data: {
        nombre: String(nombre),
        inicio: new Date(inicio),
        fin: new Date(fin),
        horasMeta: Number(horasMeta),
      },
    });
    res.json(per);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Listar períodos (más recientes primero) */
router.get("/periodos", requireAuth, async (_req, res) => {
  const list = await prisma.periodoNomina.findMany({
    orderBy: { inicio: "desc" },
  });
  res.json(list);
});

/** Obtener un período */
router.get("/periodos/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const per = await prisma.periodoNomina.findUnique({ where: { id } });
  if (!per) return res.status(404).json({ error: "Período no encontrado" });
  res.json(per);
});

/** Actualizar un período (incluye horasMeta) */
router.put("/periodos/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    const data = {};

    if ("nombre" in body) {
      const v = String(body.nombre || "").trim();
      if (!v) return res.status(400).json({ error: "nombre no puede ser vacío" });
      data.nombre = v;
    }
    if ("inicio" in body) {
      const d = new Date(body.inicio);
      if (isNaN(d)) return res.status(400).json({ error: "inicio inválido" });
      data.inicio = d;
    }
    if ("fin" in body) {
      const d = new Date(body.fin);
      if (isNaN(d)) return res.status(400).json({ error: "fin inválido" });
      data.fin = d;
    }
    if ("cerrado" in body) {
      data.cerrado = !!body.cerrado;
    }
    if ("horasMeta" in body) {
      const hm = Number(body.horasMeta);
      if (!Number.isFinite(hm) || hm <= 0) {
        return res.status(400).json({ error: "horasMeta debe ser un número > 0" });
      }
      data.horasMeta = hm;
    }

    const updated = await prisma.periodoNomina.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Items de un período */
router.get("/:periodoId/items", requireAuth, async (req, res) => {
  const periodoId = Number(req.params.periodoId);
  const items = await prisma.nominaItem.findMany({
    where: { periodoId },
    include: {
      empleado: { select: { id: true, codigo: true, nombre: true, apellido: true } },
      periodo:  { select: { id: true, nombre: true, horasMeta: true } },
    },
    orderBy: { empleadoId: "asc" },
  });
  res.json(items);
});

/** Calcular período (sin extras) */
router.post("/:periodoId/calcular", requireAuth, async (req, res) => {
  try {
    const periodoId = Number(req.params.periodoId);
    const { bonosGlobal = 0, descuentosGlobal = 0 } = req.body || {};
    const items = await calcularPeriodo(periodoId, { bonosGlobal, descuentosGlobal });
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
