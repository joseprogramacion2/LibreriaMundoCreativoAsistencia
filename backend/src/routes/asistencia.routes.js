// backend/src/routes/asistencia.routes.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/* ================== Zona horaria Guatemala ================== */
const TZ = "America/Guatemala";

/** YYYY-MM-DD para una fecha UTC, pero visto en Guatemala */
function ymdInGT(dateUTC) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateUTC);
}

/** Minutos desde 00:00 del día local en Guatemala para una fecha UTC */
function minutesInGT(dateUTC) {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(dateUTC); // "HH:MM"
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Fecha de hoy (YYYY-MM-DD) en Guatemala */
function todayGTString() {
  return ymdInGT(new Date());
}

/** Ventana UTC que cubre un día local en Guatemala */
function localDayUTCWindow(yyyy_mm_dd) {
  // Guatemala no usa DST, -06:00 todo el año
  const startUTC = new Date(`${yyyy_mm_dd}T00:00:00.000-06:00`);
  const endUTC = new Date(`${yyyy_mm_dd}T23:59:59.999-06:00`);
  return { startUTC, endUTC };
}

function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}

/* ========= BÚSQUEDA: AND de tokens sobre nombre/apellido/código ========= */
/**
 * buildNameWhereFromTokens("jose alberto vasquez")
 *   => AND: [
 *        OR: nombre/apellido/codigo CONTAINS 'jose',
 *        OR: nombre/apellido/codigo CONTAINS 'alberto',
 *        OR: nombre/apellido/codigo CONTAINS 'vasquez'
 *      ]
 * (insensitive = sin distinguir mayúsculas/minúsculas)
 */
function buildNameWhereFromTokens(q) {
  const tokens = String(q || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) return {};
  return {
    AND: tokens.map((t) => ({
      OR: [
        { nombre:   { contains: t, mode: "insensitive" } },
        { apellido: { contains: t, mode: "insensitive" } },
        { codigo:   { contains: t, mode: "insensitive" } },
      ],
    })),
  };
}

/* ================== EVENTOS CRUDOS ================== */
router.get("/eventos", async (req, res) => {
  try {
    const { from, to, limit = 50, empleadoId, dispositivoId, sucursalId } = req.query;

    const where = {};
    if (from) where.timestampUTC = { gte: new Date(from) };
    if (to)   where.timestampUTC = { ...(where.timestampUTC || {}), lte: new Date(to) };
    if (empleadoId)  where.empleadoId  = Number(empleadoId);
    if (dispositivoId) where.dispositivoId = Number(dispositivoId);
    if (sucursalId)  where.dispositivo = { sucursalId: Number(sucursalId) };

    const rows = await prisma.asistenciaEvento.findMany({
      where,
      include: { empleado: true, dispositivo: { include: { sucursal: true } } },
      orderBy: { timestampUTC: "desc" },
      take: Number(limit),
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al obtener eventos." });
  }
});

/* ================== ASISTENCIA DIARIA (solo HOY GT) ================== */
router.get("/diaria", async (req, res) => {
  try {
    const fecha = todayGTString(); // 🔒 SIEMPRE hoy en Guatemala
    const sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : null;
    const q = req.query.q ? String(req.query.q) : null;

    // 1) Empleados (solo activos) + búsqueda tokenizada
    const empWhere = {
      activo: true,
      ...(sucursalId ? { sucursalId } : {}),
      ...(q ? buildNameWhereFromTokens(q) : {}),
    };

    const empleados = await prisma.empleado.findMany({
      where: empWhere,
      include: { sucursal: true },
    });
    const empIds = empleados.map((e) => e.id);
    if (empIds.length === 0) return res.json([]);

    // 2) Ventana UTC equivalente al día local GT
    const { startUTC, endUTC } = localDayUTCWindow(fecha);

    // 3) Eventos del día
    const eventos = await prisma.asistenciaEvento.findMany({
      where: {
        empleadoId: { in: empIds },
        timestampUTC: { gte: startUTC, lte: endUTC },
      },
      include: { dispositivo: { include: { sucursal: true } } },
      orderBy: { timestampUTC: "asc" },
    });

    // 4) Turno vigente por empleado (último que cubre el día)
    const asignaciones = await prisma.turnoAsignado.findMany({
      where: {
        empleadoId: { in: empIds },
        desde: { lte: endUTC },
        OR: [{ hasta: null }, { hasta: { gte: startUTC } }],
      },
      include: { turno: true },
      orderBy: { desde: "desc" },
    });
    const turnoPorEmpleado = new Map();
    for (const a of asignaciones) {
      if (!turnoPorEmpleado.has(a.empleadoId)) turnoPorEmpleado.set(a.empleadoId, a.turno);
    }

    // 5) Agrupar eventos y calcular estado
    const eventosPorEmp = new Map();
    for (const ev of eventos) {
      if (!eventosPorEmp.has(ev.empleadoId)) eventosPorEmp.set(ev.empleadoId, []);
      eventosPorEmp.get(ev.empleadoId).push(ev);
    }

    const rows = empleados.map((emp) => {
      const evs = (eventosPorEmp.get(emp.id) || []).sort(
        (a, b) => a.timestampUTC.getTime() - b.timestampUTC.getTime()
      );

      const entradaUTC = evs[0]?.timestampUTC || null;
      const salidaUTC  = evs.length >= 2 ? evs[evs.length - 1].timestampUTC : null;
      const turno = turnoPorEmpleado.get(emp.id) || null;

      let estado = "INA";
      let minutosTarde = 0;
      let minutosTemprano = 0;

      if (entradaUTC) {
        if (!salidaUTC || salidaUTC <= entradaUTC) {
          estado = "INCOMPLETO";
        } else {
          estado = "NORMAL";

          if (turno) {
            const tolerancia = Number(turno.toleranciaMinutos ?? 0);

            // Tardanza (aplica tolerancia a la entrada)
            const mEnt = minutesInGT(entradaUTC);
            const limiteEntrada = hhmmToMinutes(turno.horaEntrada) + tolerancia;
            if (mEnt > limiteEntrada) {
              estado = "TARDE";
              minutosTarde = mEnt - limiteEntrada;
            }

            // Salida anticipada (aplica tolerancia a la salida)
            const mSal = minutesInGT(salidaUTC);
            const finJornada = hhmmToMinutes(turno.horaSalida);
            const earlyTotal = finJornada - mSal;
            if (earlyTotal > tolerancia) {
              estado = "SALIDA_TEMPRANA";
              minutosTemprano = earlyTotal - tolerancia;
            }
          }
        }
      }

      return {
        empleadoId: emp.id,
        empleadoCodigo: emp.codigo,
        empleadoNombre: `${emp.nombre} ${emp.apellido}`.trim(),
        sucursalNombre: emp.sucursal?.nombre || null,
        entrada: entradaUTC,
        salida: salidaUTC,
        estado,
        minutosTarde,
        minutosTemprano,
      };
    });

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al calcular asistencia diaria." });
  }
});

/* ================== HISTORIAL (incluye AUSENCIAS) ================== */
router.get("/historial", async (req, res) => {
  try {
    const from = String(req.query.from || "").slice(0, 10);
    const to   = String(req.query.to   || "").slice(0, 10);
    if (!from || !to) {
      return res.status(400).json({ error: "from y to (YYYY-MM-DD) requeridos" });
    }

    const sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : null;
    const q = req.query.q ? String(req.query.q) : null;

    // 1) Empleados a considerar (NO filtramos por activo para ver histórico) + búsqueda tokenizada
    const empWhere = {
      ...(sucursalId ? { sucursalId } : {}),
      ...(q ? buildNameWhereFromTokens(q) : {}),
    };

    const empleados = await prisma.empleado.findMany({
      where: empWhere,
      include: { sucursal: true },
    });
    const empIds = empleados.map((e) => e.id);
    if (empIds.length === 0) return res.json([]);

    const rangeStartUTC = new Date(`${from}T00:00:00.000-06:00`);
    const rangeEndUTC   = new Date(`${to}T23:59:59.999-06:00`);

    // 2) Eventos del rango
    const eventos = await prisma.asistenciaEvento.findMany({
      where: {
        empleadoId: { in: empIds },
        timestampUTC: { gte: rangeStartUTC, lte: rangeEndUTC },
      },
      orderBy: { timestampUTC: "asc" },
    });

    // 3) Agrupar eventos por empleado + día local (GT)
    const byKey = new Map(); // `${empleadoId}|YYYY-MM-DD` -> eventos[]
    for (const ev of eventos) {
      const key = `${ev.empleadoId}|${ymdInGT(ev.timestampUTC)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(ev);
    }

    // 4) Pre-cargar asignaciones de turno que cruzan el rango
    const asign = await prisma.turnoAsignado.findMany({
      where: {
        empleadoId: { in: empIds },
        desde: { lte: rangeEndUTC },
        OR: [{ hasta: null }, { hasta: { gte: rangeStartUTC } }],
      },
      include: { turno: true },
      orderBy: { desde: "asc" },
    });
    const asignByEmp = new Map();
    for (const a of asign) {
      if (!asignByEmp.has(a.empleadoId)) asignByEmp.set(a.empleadoId, []);
      asignByEmp.get(a.empleadoId).push(a);
    }
    function pickTurno(empleadoId, dStartUTC, dEndUTC) {
      const list = asignByEmp.get(empleadoId) || [];
      let best = null;
      for (const a of list) {
        const covers = a.desde <= dEndUTC && (a.hasta == null || a.hasta >= dStartUTC);
        if (covers && (!best || a.desde > best.desde)) best = a;
      }
      return best?.turno || null;
    }

    // 5) Lista de días del rango (en GT)
    const days = [];
    let cursor = new Date(`${from}T00:00:00.000-06:00`);
    const last = new Date(`${to}T00:00:00.000-06:00`);
    while (cursor <= last) {
      days.push(ymdInGT(cursor));
      cursor = new Date(cursor.getTime() + 86400000);
    }

    // 6) Construir filas (incluye días sin eventos => INA)
    const rows = [];
    for (const emp of empleados) {
      for (const day of days) {
        const key = `${emp.id}|${day}`;
        const evs = (byKey.get(key) || []).sort(
          (a, b) => a.timestampUTC.getTime() - b.timestampUTC.getTime()
        );

        const { startUTC: dStartUTC, endUTC: dEndUTC } = localDayUTCWindow(day);
        const turno = pickTurno(emp.id, dStartUTC, dEndUTC);

        let entradaUTC = null;
        let salidaUTC = null;
        let estado = "INA";
        let minutosTarde = 0;
        let minutosTemprano = 0;

        if (evs.length > 0) {
          entradaUTC = evs[0].timestampUTC;
          salidaUTC = evs.length >= 2 ? evs[evs.length - 1].timestampUTC : null;

          if (!salidaUTC || salidaUTC <= entradaUTC) {
            estado = "INCOMPLETO";
          } else {
            estado = "NORMAL";

            if (turno) {
              const toler = Number(turno.toleranciaMinutos ?? 0);

              // tardanza (con tolerancia)
              const mEnt = minutesInGT(entradaUTC);
              const limiteEntrada = hhmmToMinutes(turno.horaEntrada) + toler;
              if (mEnt > limiteEntrada) {
                estado = "TARDE";
                minutosTarde = mEnt - limiteEntrada;
              }

              // salida anticipada (con tolerancia)
              const mSal = minutesInGT(salidaUTC);
              const finJornada = hhmmToMinutes(turno.horaSalida);
              const earlyTotal = finJornada - mSal;
              if (earlyTotal > toler) {
                estado = "TEMPRANO";
                minutosTemprano = earlyTotal - toler;
              }
            }
          }
        }

        rows.push({
          fecha: day,
          empleadoId: emp.id,
          empleadoCodigo: emp.codigo,
          empleadoNombre: `${emp.nombre} ${emp.apellido}`,
          sucursalNombre: emp.sucursal?.nombre || null,
          entrada: entradaUTC,
          salida: salidaUTC,
          estado,
          minutosTarde,
          minutosTemprano,
        });
      }
    }

    // Ordenar por fecha y luego por empleado
    rows.sort((a, b) =>
      a.fecha === b.fecha
        ? a.empleadoNombre.localeCompare(b.empleadoNombre)
        : a.fecha.localeCompare(b.fecha)
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al obtener historial." });
  }
});

export default router;
