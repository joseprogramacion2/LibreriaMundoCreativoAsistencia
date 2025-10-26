// backend/src/routes/empleados.routes.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/* ===================== Zona horaria Guatemala ===================== */
const TZ = "America/Guatemala";

/** YYYY-MM-DD (hoy) según Guatemala */
function todayGTString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ventana UTC que cubre un día local en Guatemala */
function localDayUTCWindow(yyyy_mm_dd) {
  // Guatemala no usa DST, -06:00 todo el año
  const startUTC = new Date(`${yyyy_mm_dd}T00:00:00.000-06:00`);
  const endUTC = new Date(`${yyyy_mm_dd}T23:59:59.999-06:00`);
  return { startUTC, endUTC };
}

/** Trunca una fecha (o ahora) al inicio del día local GT y devuelve Date UTC equivalente */
function floorToLocalDayGT(dateLike) {
  const d = dateLike ? new Date(dateLike) : new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  // 00:00 GT
  return new Date(`${ymd}T00:00:00.000-06:00`);
}

/** ¿El empleado tiene algún evento hoy (GT)? */
async function hasEventsTodayGT(empleadoId) {
  const { startUTC, endUTC } = localDayUTCWindow(todayGTString());
  const ev = await prisma.asistenciaEvento.findFirst({
    where: {
      empleadoId: Number(empleadoId),
      timestampUTC: { gte: startUTC, lte: endUTC },
    },
    select: { id: true },
  });
  return !!ev;
}

/* ===================== Helpers de datos ===================== */
function fmtEmpCode(n) {
  return `EMP${String(n).padStart(3, "0")}`;
}
async function nextEmpCode() {
  const last = await prisma.empleado.findFirst({
    select: { id: true },
    orderBy: { id: "desc" },
  });
  const n = (last?.id || 0) + 1;
  return fmtEmpCode(n);
}
function onlyDigits(s = "") {
  return String(s).replace(/\D/g, "");
}
function isValidDPI13(dpiDigits) {
  return /^\d{13}$/.test(dpiDigits);
}

/* ===================== LISTAR ===================== */
// GET /empleados?q=&sucursalId=
router.get("/", async (req, res) => {
  const { q, sucursalId } = req.query;

  const where = {};
  if (q) {
    where.OR = [
      { nombre:  { contains: String(q), mode: "insensitive" } },
      { apellido:{ contains: String(q), mode: "insensitive" } },
      { codigo:  { contains: String(q), mode: "insensitive" } },
      { dpi:     { contains: onlyDigits(String(q)), mode: "insensitive" } },
    ];
  }
  if (sucursalId) where.sucursalId = Number(sucursalId);

  const rows = await prisma.empleado.findMany({
    where,
    include: {
      sucursal: true,
      // turno vigente (hasta null) más reciente
      turnos: {
        where: { hasta: null },
        orderBy: { desde: "desc" },
        take: 1,
        include: { turno: true },
      },
    },
    orderBy: { id: "desc" },
  });

  res.json(rows);
});

/* ===================== CREAR ===================== */
// POST /empleados
router.post("/", async (req, res) => {
  try {
    const {
      dpi,
      nombre,
      apellido,
      sucursalId,
      correo,
      activo = true,
      userIdDispositivo,
      turnoId, // OBLIGATORIO
      salarioMensual, // opcional (no nulo en schema)
      horasMetaRef,   // meta de horas por empleado (UI)
    } = req.body;

    const dpiDigits = onlyDigits(dpi);
    if (!isValidDPI13(dpiDigits)) {
      return res.status(400).json({ ok:false, message:"DPI inválido. Debe tener 13 dígitos (formato 4-5-4)." });
    }
    if (!turnoId) {
      return res.status(400).json({ ok:false, message:"Seleccionar turno es obligatorio." });
    }

    const sucId = Number(sucursalId);
    const existeTurno = await prisma.turno.findUnique({ where: { id: Number(turnoId) } });
    if (!existeTurno) return res.status(404).json({ ok:false, message:"Turno no encontrado." });

    // ===== Validación: userIdDispositivo único por sucursal =====
    let uid = null;
    if (userIdDispositivo !== "" && userIdDispositivo != null) {
      uid = Number(userIdDispositivo);
      if (!Number.isFinite(uid) || uid <= 0) {
        return res.status(400).json({ ok:false, message:"UserID en el reloj debe ser un número positivo." });
      }
      const yaExiste = await prisma.empleado.findFirst({
        where: { sucursalId: sucId, userIdDispositivo: uid },
        select: { id: true }
      });
      if (yaExiste) {
        return res.status(409).json({ ok:false, message:"Ya existe un empleado con ese UserID en esta sucursal." });
      }
    }

    const finalCodigo = await nextEmpCode();
    const desde = floorToLocalDayGT(); // hoy 00:00 GT -> UTC equivalente

    const empleado = await prisma.$transaction(async (tx) => {
      // Construimos data sin enviar salarioMensual si viene null/undefined
      const data = {
        codigo: finalCodigo,
        dpi: dpiDigits,
        nombre: String(nombre || "").trim(),
        apellido: String(apellido || "").trim(),
        correo: correo?.trim() || null,
        sucursal: { connect: { id: sucId } },
        activo: !!activo,
        userIdDispositivo: uid,
      };

      const s = Number(salarioMensual);
      if (Number.isFinite(s)) {
        data.salarioMensual = s;
      }

      const hm = Number(horasMetaRef);
      if (Number.isFinite(hm) && hm > 0) {
        data.horasMetaRef = hm;
      }

      const emp = await tx.empleado.create({ data });

      // Cierra activos (por si acaso) y crea nuevo turno asignado desde hoy 00:00 GT
      await tx.turnoAsignado.updateMany({
        where: { empleadoId: emp.id, hasta: null },
        data: { hasta: new Date(desde.getTime() - 1000) },
      });
      await tx.turnoAsignado.create({
        data: { empleadoId: emp.id, turnoId: Number(turnoId), desde, hasta: null },
      });

      return emp.id;
    });

    const full = await prisma.empleado.findUnique({
      where: { id: empleado },
      include: {
        sucursal: true,
        turnos: {
          where: { hasta: null },
          orderBy: { desde: "desc" },
          take: 1,
          include: { turno: true },
        },
      },
    });

    res.json(full);
  } catch (e) {
    if (e?.code === "P2002" && Array.isArray(e.meta?.target)) {
      // Único por sucursal para userId
      if (e.meta.target.includes("sucursalId") && e.meta.target.includes("userIdDispositivo")) {
        return res.status(409).json({ ok:false, message:"Ya existe un empleado con ese UserID en esta sucursal." });
      }
      // Único por DPI
      if (e.meta.target.includes("dpi")) {
        return res.status(409).json({ ok:false, message:"DPI ya está registrado." });
      }
    }
    console.error("POST /empleados error:", e);
    res.status(500).json({ ok:false, message:"Error interno al crear empleado." });
  }
});

/* ===================== ACTUALIZAR ===================== */
// PUT /empleados/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const body = req.body || {};
    const data = {};

    // Cargamos empleado actual (necesario para validar unicidad con sucursal actual o nueva)
    const actual = await prisma.empleado.findUnique({
      where: { id },
      select: { sucursalId: true },
    });
    if (!actual) return res.status(404).json({ ok:false, message:"Empleado no encontrado." });

    // si viene sucursalId, usamos connect en la relación
    let targetSucursalId = actual.sucursalId;
    if ("sucursalId" in body) {
      targetSucursalId = Number(body.sucursalId);
      data.sucursal = { connect: { id: targetSucursalId } };
    }
    if ("activo" in body) data.activo = !!body.activo;

    // Si se intenta desactivar, verificar si ya marcó asistencia hoy
    if (body.activo === false) {
      const hoy = todayGTString();
      const { startUTC, endUTC } = localDayUTCWindow(hoy);

      const tieneEventoHoy = await prisma.asistenciaEvento.findFirst({
        where: {
          empleadoId: id,
          timestampUTC: { gte: startUTC, lte: endUTC },
        },
        select: { id: true },
      });

      if (tieneEventoHoy) {
        return res.status(400).json({
          ok: false,
          message: "No se puede desactivar: el empleado ya marcó asistencia hoy.",
        });
      }
    }

    // ===== Validación: userIdDispositivo único por sucursal =====
    if ("userIdDispositivo" in body) {
      const v = body.userIdDispositivo;
      const uid = (v === "" || v === null) ? null : Number(v);
      if (uid != null) {
        if (!Number.isFinite(uid) || uid <= 0) {
          return res.status(400).json({ ok:false, message:"UserID en el reloj debe ser un número positivo." });
        }
        const yaExiste = await prisma.empleado.findFirst({
          where: { sucursalId: targetSucursalId, userIdDispositivo: uid, id: { not: id } },
          select: { id: true },
        });
        if (yaExiste) {
          return res.status(409).json({ ok:false, message:"Ya existe un empleado con ese UserID en esta sucursal." });
        }
      }
      data.userIdDispositivo = uid;
    }

    if ("dpi" in body) {
      const dpiDigits = onlyDigits(body.dpi);
      if (!isValidDPI13(dpiDigits)) {
        return res.status(400).json({ ok:false, message:"DPI inválido. Debe tener 13 dígitos (formato 4-5-4)." });
      }
      data.dpi = dpiDigits;
    }

    if ("nombre" in body)   data.nombre   = String(body.nombre).trim();
    if ("apellido" in body) data.apellido = String(body.apellido).trim();
    if ("correo" in body)   data.correo   = String(body.correo).trim();

    // salarioMensual ya no acepta null en tu schema -> si llega, o número válido o lo ignoramos
    if ("salarioMensual" in body) {
      const s = Number(body.salarioMensual);
      if (Number.isFinite(s)) {
        data.salarioMensual = s;
      }
    }

    // Actualizar meta de horas si viene (>0)
    if ("horasMetaRef" in body) {
      const hm = Number(body.horasMetaRef);
      if (Number.isFinite(hm) && hm > 0) {
        data.horasMetaRef = hm;
      }
    }

    // ===== Transacción: actualiza empleado y opcionalmente cambia turno =====
    await prisma.$transaction(async (tx) => {
      await tx.empleado.update({ where: { id }, data });

      if (body.turnoId) {
        const nuevoTurnoId = Number(body.turnoId);

        // 1) Si el turno actual ya es el mismo, NO hacer nada y salir
        const vigente = await tx.turnoAsignado.findFirst({
          where: { empleadoId: id, hasta: null },
          orderBy: { desde: "desc" },
          select: { turnoId: true },
        });
        if (vigente && Number(vigente.turnoId) === nuevoTurnoId) {
          return; // mismo turno
        }

        // 2) Validaciones normales (ya-no-permitir-hoy)
        const yaMarcoHoy = await hasEventsTodayGT(id);
        const desde = floorToLocalDayGT(); // hoy 00:00 GT
        if (yaMarcoHoy) {
          throw Object.assign(new Error("CANT_CHANGE_TURNO_TODAY"), {
            meta: { message: "No se puede cambiar el turno hoy: el empleado ya marcó entrada/salida. Programa el cambio desde mañana." }
          });
        }

        const turno = await tx.turno.findUnique({ where: { id: nuevoTurnoId } });
        if (!turno) throw new Error("TURNONOTFOUND");

        await tx.turnoAsignado.updateMany({
          where: { empleadoId: id, hasta: null },
          data: { hasta: new Date(desde.getTime() - 1000) },
        });
        await tx.turnoAsignado.create({
          data: { empleadoId: id, turnoId: nuevoTurnoId, desde, hasta: null },
        });
      }
    });

    const updated = await prisma.empleado.findUnique({
      where: { id },
      include: {
        sucursal: true,
        turnos: {
          where: { hasta: null },
          orderBy: { desde: "desc" },
          take: 1,
          include: { turno: true },
        },
      },
    });

    res.json(updated);
  } catch (e) {
    if (e?.message === "TURNONOTFOUND") {
      return res.status(404).json({ ok:false, message:"Turno no encontrado." });
    }
    if (e?.message === "CANT_CHANGE_TURNO_TODAY") {
      return res.status(400).json({ ok:false, message: e?.meta?.message || "No se puede cambiar el turno hoy." });
    }
    if (e?.code === "P2002" && Array.isArray(e.meta?.target)) {
      if (e.meta.target.includes("sucursalId") && e.meta.target.includes("userIdDispositivo")) {
        return res.status(409).json({ ok:false, message:"Ya existe un empleado con ese UserID en esta sucursal." });
      }
      if (e.meta.target.includes("dpi")) {
        return res.status(409).json({ ok:false, message:"DPI ya está registrado." });
      }
    }
    console.error("PUT /empleados/:id error:", e);
    res.status(500).json({ ok:false, message:"Error interno al actualizar empleado." });
  }
});

/* ============ ASIGNAR/REASIGNAR TURNO (con fecha) ============ */
// POST /empleados/:id/turno  { turnoId, desde, hasta }
router.post("/:id/turno", async (req, res) => {
  try {
    const empleadoId = Number(req.params.id);
    const { turnoId } = req.body;
    let { desde, hasta } = req.body;

    const turno = await prisma.turno.findUnique({ where: { id: Number(turnoId) } });
    if (!turno) return res.status(404).json({ ok:false, message:"Turno no encontrado." });

    // Normalizamos "desde" al inicio del día GT
    const d = floorToLocalDayGT(desde);
    const h = hasta ? new Date(hasta) : null;

    // Si ya marcó hoy, validar que "d" sea > fin de hoy (o sea, mañana o después)
    const yaMarcoHoy = await hasEventsTodayGT(empleadoId);
    if (yaMarcoHoy) {
      const { endUTC: endTodayUTC } = localDayUTCWindow(todayGTString());
      if (d <= endTodayUTC) {
        return res.status(400).json({
          ok: false,
          message: "No se puede cambiar el turno hoy: el empleado ya marcó entrada/salida. Programa el cambio desde mañana.",
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      // cerramos vigente(s) si la nueva asignación empieza "ya"
      await tx.turnoAsignado.updateMany({
        where: { empleadoId, hasta: null },
        data: { hasta: new Date(d.getTime() - 1000) },
      });
      return tx.turnoAsignado.create({
        data: { empleadoId, turnoId: Number(turnoId), desde: d, hasta: h },
      });
    });

    res.json(created);
  } catch (e) {
    console.error("POST /empleados/:id/turno error:", e);
    res.status(500).json({ ok:false, message:"Error interno al asignar turno." });
  }
});

export default router;
