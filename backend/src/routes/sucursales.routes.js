import { Router } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const router = Router();

// GET /sucursales
router.get("/", async (_req, res) => {
  const rows = await prisma.sucursal.findMany({ orderBy: { id: "desc" } });
  res.json(rows);
});

// POST /sucursales
router.post("/", async (req, res) => {
  const { nombre, direccion, activo = true } = req.body;
  const created = await prisma.sucursal.create({
    data: { nombre, direccion: direccion || null, activo: !!activo },
  });
  res.json(created);
});

// PUT /sucursales/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updated = await prisma.sucursal.update({ where: { id }, data: req.body });
  res.json(updated);
});

export default router;
