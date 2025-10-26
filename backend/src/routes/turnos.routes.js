// backend/src/routes/turnos.routes.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const router = Router();

function isHHMM(s = "") { return /^\d{2}:\d{2}$/.test(String(s)); }
function toMin(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h * 60) + m;
}
function truthy(v) {
  return /^(1|true|yes|on)$/i.test(String(v || "").trim());
}

// GET /turnos  (opcional: ?onlyActivos=1)
router.get("/", async (req, res) => {
  const onlyActivos = truthy(req.query.onlyActivos);
  const where = onlyActivos ? { activo: true } : {};
  const rows = await prisma.turno.findMany({ where, orderBy: { id: "desc" } });
  res.json(rows);
});

// POST /turnos
router.post("/", async (req, res) => {
  try {
    const { nombre, horaEntrada, horaSalida, toleranciaMinutos = 5, activo = true } = req.body;

    if (!String(nombre || "").trim()) return res.status(400).json({ message: "El nombre es obligatorio." });
    if (!isHHMM(horaEntrada) || !isHHMM(horaSalida)) return res.status(400).json({ message: "Horas con formato HH:MM." });
    if (toMin(horaSalida) <= toMin(horaEntrada)) return res.status(400).json({ message: "La salida debe ser mayor que la entrada." });

    const created = await prisma.turno.create({
      data: { nombre: String(nombre).trim(), horaEntrada, horaSalida, toleranciaMinutos: Number(toleranciaMinutos), activo: !!activo },
    });
    res.json(created);
  } catch (e) {
    if (e?.code === "P2002") return res.status(409).json({ message: "Ya existe un turno con ese nombre." });
    res.status(500).json({ message: "Error interno al crear turno." });
  }
});

// PUT /turnos/:id
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = {};
    const { nombre, horaEntrada, horaSalida, toleranciaMinutos, activo } = req.body ?? {};

    if (nombre !== undefined) {
      if (!String(nombre).trim()) return res.status(400).json({ message: "El nombre es obligatorio." });
      data.nombre = String(nombre).trim();
    }
    if (horaEntrada !== undefined) {
      if (!isHHMM(horaEntrada)) return res.status(400).json({ message: "horaEntrada debe ser HH:MM." });
      data.horaEntrada = horaEntrada;
    }
    if (horaSalida !== undefined) {
      if (!isHHMM(horaSalida)) return res.status(400).json({ message: "horaSalida debe ser HH:MM." });
      data.horaSalida = horaSalida;
    }
    if (data.horaEntrada || data.horaSalida) {
      const rec = { ...(await prisma.turno.findUnique({ where: { id } })), ...data };
      if (toMin(rec.horaSalida) <= toMin(rec.horaEntrada)) {
        return res.status(400).json({ message: "La salida debe ser mayor que la entrada." });
      }
    }
    if (toleranciaMinutos !== undefined) data.toleranciaMinutos = Number(toleranciaMinutos);

    // ⛔ No permitir desactivar si hay empleados con este turno vigente
    if (activo === false) {
      const inUse = await prisma.turnoAsignado.findFirst({
        where: { turnoId: id, hasta: null },
        select: { id: true },
      });
      if (inUse) {
        return res.status(400).json({
          message: "No se puede desactivar: hay empleados con este turno vigente.",
        });
      }
      data.activo = false;
    } else if (activo === true) {
      data.activo = true;
    }

    const updated = await prisma.turno.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    if (e?.code === "P2002") return res.status(409).json({ message: "Ya existe un turno con ese nombre." });
    res.status(500).json({ message: "Error interno al actualizar turno." });
  }
});

export default router;
