import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// =================== LISTAR ===================
router.get("/", async (_req, res) => {
  const rows = await prisma.sucursal.findMany({
    orderBy: { id: "desc" },
  });
  res.json(rows);
});

// =================== CREAR ===================
router.post("/", async (req, res) => {
  try {
    const { nombre, direccion, activo = true } = req.body;
    if (!String(nombre || "").trim()) {
      return res.status(400).json({ message: "El nombre es obligatorio." });
    }
    const created = await prisma.sucursal.create({
      data: {
        nombre: nombre.trim(),
        direccion: direccion?.trim() || null,
        activo: !!activo,
      },
    });
    res.json(created);
  } catch (e) {
    console.error("POST /sucursales error:", e);
    res.status(500).json({ message: "Error al crear sucursal." });
  }
});

// =================== ACTUALIZAR ===================
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};

    // === Si se intenta DESACTIVAR la sucursal ===
    if ("activo" in body && body.activo === false) {
      // 1. Verificar empleados activos
      const empleadosActivos = await prisma.empleado.count({
        where: { sucursalId: id, activo: true },
      });
      if (empleadosActivos > 0) {
        return res.status(400).json({
          message:
            "❌ No se puede desactivar: existen empleados activos ligados a esta sucursal. Desactívalos o reasígnalos primero.",
        });
      }

      // 2. Verificar dispositivos activos
      const dispositivosActivos = await prisma.dispositivo.count({
        where: { sucursalId: id, activo: true },
      });
      if (dispositivosActivos > 0) {
        return res.status(400).json({
          message:
            "❌ No se puede desactivar: existen dispositivos activos ligados a esta sucursal. Desactívalos o muévelos primero.",
        });
      }
    }

    // === Actualizar campos ===
    const data = {};
    if ("nombre" in body) data.nombre = String(body.nombre || "").trim();
    if ("direccion" in body) data.direccion = body.direccion?.trim() || null;
    if ("activo" in body) data.activo = !!body.activo;

    const updated = await prisma.sucursal.update({
      where: { id },
      data,
    });

    res.json(updated);
  } catch (e) {
    console.error("PUT /sucursales/:id error:", e);
    if (String(e?.message || "").includes("Record to update not found")) {
      return res.status(404).json({ message: "Sucursal no encontrada." });
    }
    res.status(500).json({ message: "Error al actualizar sucursal." });
  }
});

// =================== EXPORTAR ===================
export default router;
