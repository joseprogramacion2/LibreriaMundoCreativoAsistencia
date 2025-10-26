// backend/src/routes/ml.routes.js
import express from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = express.Router();

/* ================== Zona horaria Guatemala ================== */
const TZ = "America/Guatemala";

function ymdGT(dateUTC) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(dateUTC);
}
function minutesInGT(dateUTC) {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).format(dateUTC);
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function localDayUTCWindow(yyyy_mm_dd) {
  return {
    startUTC: new Date(`${yyyy_mm_dd}T00:00:00.000-06:00`),
    endUTC:   new Date(`${yyyy_mm_dd}T23:59:59.999-06:00`),
  };
}
function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}
const WD = (d) => (((new Date(d).getDay() + 6) % 7) + 1); // 1..7 (L..D)
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function ymdUTC(d) { return new Date(d).toISOString().slice(0,10); }

/* ============ Construir “diario” desde asistenciaEvento ============ */
async function buildDailyRows({ fromISO, toISO, sucursalId }) {
  const rangeStartUTC = new Date(`${fromISO}T00:00:00.000-06:00`);
  const rangeEndUTC   = new Date(`${toISO}T23:59:59.999-06:00`);

  // Empleados del filtro (no limito a activos para histórico)
  const empWhere = {};
  if (sucursalId) empWhere.sucursalId = Number(sucursalId);
  const empleados = await prisma.empleado.findMany({
    where: empWhere,
    include: { sucursal: true },
  });
  const empIds = empleados.map(e => e.id);
  if (empIds.length === 0) return [];

  // Eventos del rango
  const eventos = await prisma.asistenciaEvento.findMany({
    where: {
      empleadoId: { in: empIds },
      timestampUTC: { gte: rangeStartUTC, lte: rangeEndUTC },
    },
    orderBy: { timestampUTC: "asc" },
  });

  // Agrupar por empleado + día GT
  const byKey = new Map(); // `${empleadoId}|YYYY-MM-DD`
  for (const ev of eventos) {
    const key = `${ev.empleadoId}|${ymdGT(ev.timestampUTC)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(ev);
  }

  // Asignaciones de turno que cruzan el rango
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

  // Lista de días del rango (GT)
  const days = [];
  let cursor = new Date(`${fromISO}T00:00:00.000-06:00`);
  const last = new Date(`${toISO}T00:00:00.000-06:00`);
  while (cursor <= last) {
    days.push(ymdGT(cursor));
    cursor = new Date(cursor.getTime() + 86400000);
  }

  const rows = [];
  for (const emp of empleados) {
    for (const day of days) {
      const key = `${emp.id}|${day}`;
      const evs = (byKey.get(key) || []).sort((a,b)=>a.timestampUTC - b.timestampUTC);

      const { startUTC: dStartUTC, endUTC: dEndUTC } = localDayUTCWindow(day);
      const turno = pickTurno(emp.id, dStartUTC, dEndUTC);

      let entradaUTC = null, salidaUTC = null;
      let estado = "INA";
      let minutosTarde = 0, minutosTemprano = 0;

      if (evs.length > 0) {
        entradaUTC = evs[0].timestampUTC;
        salidaUTC  = evs.length >= 2 ? evs[evs.length - 1].timestampUTC : null;

        if (!salidaUTC || salidaUTC <= entradaUTC) {
          estado = "INCOMPLETO";
        } else {
          estado = "NORMAL";
          if (turno) {
            const toler = Number(turno.toleranciaMinutos ?? 0);
            const mEnt = minutesInGT(entradaUTC);
            const limiteEntrada = hhmmToMinutes(turno.horaEntrada) + toler;
            if (mEnt > limiteEntrada) {
              estado = "TARDE";
              minutosTarde = mEnt - limiteEntrada;
            }
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
        empleadoNombre: `${emp.nombre} ${emp.apellido}`.trim(),
        sucursalId: emp.sucursalId ?? null,
        sucursalNombre: emp.sucursal?.nombre || "—",
        entrada: entradaUTC,
        salida: salidaUTC,
        estado,
        minutosTarde,
        minutosTemprano,
      });
    }
  }
  return rows;
}

/* ========= /ml/tardanza/proximos ========= */
router.get("/tardanza/proximos", async (req, res) => {
  try {
    const days       = clamp(Number(req.query.days || 7), 1, 31);
    const threshold  = Number(req.query.threshold ?? 0.5);
    const minObs     = clamp(Number(req.query.minObs || 3), 1, 30);
    const learnDays  = clamp(Number(req.query.learnDays || 90), 14, 365);
    const sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : null;

    const learnFromISO = ymdUTC(new Date(Date.now() - learnDays * 864e5));
    const learnToISO   = ymdUTC(new Date());

    const hist = await buildDailyRows({ fromISO: learnFromISO, toISO: learnToISO, sucursalId });

    // emp|suc → weekday(1..7) → {late, obs}
    const byEmpWd = new Map();
    for (const r of hist) {
      if (!r.entrada) continue;
      const key = `${r.empleadoId}|${r.empleadoNombre}|${r.sucursalId ?? ""}|${r.sucursalNombre}`;
      if (!byEmpWd.has(key)) byEmpWd.set(key, Array.from({ length: 8 }, () => ({ late:0, obs:0 })));
      const wd = WD(`${r.fecha}T12:00:00Z`);
      const c = byEmpWd.get(key)[wd];
      c.obs += 1;
      if (Number(r.minutosTarde || 0) > 0) c.late += 1;
    }

    const nextDays = Array.from({ length: days }, (_, i) => {
      const d = new Date(Date.now() + i * 864e5);
      d.setHours(12,0,0,0);
      return d;
    });

    const out = [];
    for (const [key, perWd] of byEmpWd.entries()) {
      const [empId, empName, sucId, sucName] = key.split("|");
      for (const d of nextDays) {
        const wd = WD(d);
        const c = perWd[wd];
        if (!c || c.obs < minObs) continue;
        const rate = c.late / c.obs;
        if (rate >= threshold) {
          out.push({
            empleadoId: Number(empId),
            empleadoNombre: empName,
            sucursalId: sucId ? Number(sucId) : null,
            sucursalNombre: sucName || "—",
            fechaISO: ymdUTC(d),
            weekday: wd,
            prob: Number(rate.toFixed(2)),
            obs: c.obs,
            tardanzas: c.late,
          });
        }
      }
    }

    out.sort((a,b)=>(b.prob-a.prob)||(b.obs-a.obs)||a.empleadoNombre.localeCompare(b.empleadoNombre));
    res.json({ items: out });
  } catch (e) {
    console.error("[ml] tardanza/proximos error", e);
    res.status(500).json({ error: "ML_predict_failed" });
  }
});

/* ========= /ml/puntual/top ========= */
router.get("/puntual/top", async (req, res) => {
  try {
    const days       = clamp(Number(req.query.days || 30), 7, 180);
    const topN       = clamp(Number(req.query.top || 1), 1, 5);
    const sucursalId = req.query.sucursalId ? Number(req.query.sucursalId) : null;

    const fromISO = ymdUTC(new Date(Date.now() - days * 864e5));
    const toISO   = ymdUTC(new Date());

    const rows = await buildDailyRows({ fromISO, toISO, sucursalId });

    // suc → emp → stats
    const agg = new Map();
    for (const r of rows) {
      const sucKey = `${r.sucursalId ?? "null"}|${r.sucursalNombre || "—"}`;
      if (!agg.has(sucKey)) agg.set(sucKey, new Map());
      const empMap = agg.get(sucKey);
      const eKey = `${r.empleadoId}|${r.empleadoNombre}`;
      if (!empMap.has(eKey)) empMap.set(eKey, { id:r.empleadoId, name:r.empleadoNombre, puntual:0, total:0 });

      if (r.entrada) {
        const st = empMap.get(eKey);
        st.total += 1;
        const late  = Number(r.minutosTarde || 0) > 0;
        const early = Number(r.minutosTemprano || 0) > 0;
        if (!late && !early) st.puntual += 1;
      }
    }

    const result = [];
    for (const [sucKey, empMap] of agg.entries()) {
      const [sucId, sucName] = sucKey.split("|");
      const list = [...empMap.values()]
        .filter(x => x.total > 0)
        .map(x => ({
          empleadoId: x.id,
          empleadoNombre: x.name,
          sucursalId: sucId === "null" ? null : Number(sucId),
          sucursalNombre: sucName,
          diasPuntuales: x.puntual,
          diasTrabajados: x.total,
          pctPuntualidad: Number(((x.puntual / x.total) * 100).toFixed(1)),
        }))
        .sort((a,b) =>
          (b.pctPuntualidad - a.pctPuntualidad) ||
          (b.diasTrabajados - a.diasTrabajados) ||
          a.empleadoNombre.localeCompare(b.empleadoNombre)
        )
        .slice(0, topN);

      result.push(...list);
    }

    result.sort((a,b) =>
      String(a.sucursalNombre).localeCompare(String(b.sucursalNombre)) ||
      (b.pctPuntualidad - a.pctPuntualidad)
    );

    res.json({ items: result });
  } catch (e) {
    console.error("[ml] puntual/top error", e);
    res.status(500).json({ error: "ML_top_puntual_failed" });
  }
});

export default router;
