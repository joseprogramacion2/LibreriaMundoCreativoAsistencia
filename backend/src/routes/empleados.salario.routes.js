// backend/src/routes/empleados.salario.routes.js
import { Router } from "express";
import { PrismaClient, PagoTipo } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// requireAuth opcional (si no existe, pasa de largo)
let requireAuth = (_req, _res, next) => next();
try {
  const m = await import("../middlewares/requireAuth.js");
  if (typeof m.default === "function") requireAuth = m.default;
} catch {}

/**
 * PUT /empleados/:id/salario
 * Body: { salarioMensual: number }
 * (Solo POR_MES; sin horas extra)
 */
router.put("/:id/salario", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const s = Number(req.body?.salarioMensual);

    if (!Number.isFinite(s) || s < 0) {
      return res.status(400).json({ error: "salarioMensual inválido" });
    }

    const emp = await prisma.empleado.update({
      where: { id },
      data: { pagoTipo: PagoTipo.POR_MES, salarioMensual: s },
      select: { id: true, codigo: true, nombre: true, apellido: true, pagoTipo: true, salarioMensual: true },
    });

    res.json(emp);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
