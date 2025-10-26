// routes/chat.js
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const router = Router();

/* ==== helpers zona horaria GT ==== */
const TZ = "America/Guatemala";
const ymdGT = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const todayGT = () => ymdGT(new Date());
const dayWindowUTC = (yyyy_mm_dd) => ({
  startUTC: new Date(`${yyyy_mm_dd}T00:00:00.000-06:00`),
  endUTC:   new Date(`${yyyy_mm_dd}T23:59:59.999-06:00`),
});
const hhmmToMin = (s) => {
  const [h, m] = String(s || "00:00").split(":").map(Number);
  return h * 60 + m;
};
const minutesInGT = (dateUTC) => {
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit" }).format(dateUTC);
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/* ==== reutiliza la lógica de /asistencia/diaria para HOY ==== */
async function calcularAsistenciaHoy({ sucursalId = null }) {
  const fecha = todayGT();
  const { startUTC, endUTC } = dayWindowUTC(fecha);

  const empWhere = {};
  if (sucursalId) empWhere.sucursalId = Number(sucursalId);
  const empleados = await prisma.empleado.findMany({ where: empWhere, include: { sucursal: true } });
  const empIds = empleados.map((e) => e.id);
  if (empIds.length === 0) return [];

  const eventos = await prisma.asistenciaEvento.findMany({
    where: { empleadoId: { in: empIds }, timestampUTC: { gte: startUTC, lte: endUTC } },
    orderBy: { timestampUTC: "asc" },
  });

  const turnosA = await prisma.turnoAsignado.findMany({
    where: {
      empleadoId: { in: empIds },
      desde: { lte: endUTC },
      OR: [{ hasta: null }, { hasta: { gte: startUTC } }],
    },
    include: { turno: true },
    orderBy: { desde: "desc" },
  });
  const turnoPorEmpleado = new Map();
  for (const ta of turnosA) if (!turnoPorEmpleado.has(ta.empleadoId)) turnoPorEmpleado.set(ta.empleadoId, ta.turno);

  const evsByEmp = new Map();
  for (const ev of eventos) {
    if (!evsByEmp.has(ev.empleadoId)) evsByEmp.set(ev.empleadoId, []);
    evsByEmp.get(ev.empleadoId).push(ev);
  }

  const rows = empleados.map((emp) => {
    const evs = (evsByEmp.get(emp.id) || []).sort((a, b) => a.timestampUTC.getTime() - b.timestampUTC.getTime());
    const entrada = evs[0]?.timestampUTC || null;
    const salida  = evs.length >= 2 ? evs[evs.length - 1].timestampUTC : null;

    let estado = "INA";
    let minutosTarde = 0;
    let minutosTemprano = 0;

    const turno = turnoPorEmpleado.get(emp.id) || null;
    if (entrada) {
      if (!salida || salida <= entrada) {
        estado = "INCOMPLETO";
      } else {
        estado = "NORMAL";
        if (turno) {
          const mEnt = minutesInGT(entrada);
          const limiteEnt = hhmmToMin(turno.horaEntrada) + (turno.toleranciaMinutos ?? 0);
          if (mEnt > limiteEnt) {
            estado = "TARDE";
            minutosTarde = mEnt - limiteEnt;
          }
          const mSal = minutesInGT(salida);
          const fin = hhmmToMin(turno.horaSalida);
          if (mSal < fin) {
            estado = "SALIDA_TEMPRANA";
            minutosTemprano = fin - mSal;
          }
        }
      }
    }

    return {
      empleadoId: emp.id,
      nombre: `${emp.nombre} ${emp.apellido}`,
      sucursal: emp.sucursal?.nombre || "-",
      entrada, salida,
      estado, minutosTarde, minutosTemprano,
    };
  });

  return rows;
}

/* ==== respuestas rápidas (FAQ) ==== */
const FAQ = [
  {
    keys: [/ayuda$/i, /^help$/i, /^ayuda (turno|turnos)/i],
    answer:
      "Turnos:\n1) Ir a Empleados → Turnos\n2) Crear turno con entrada/salida y tolerancia\n3) Asignar turno al empleado (Editar → Turno)\n",
  },
  {
    keys: [/ayuda (dispositivo|dispositivos)/i],
    answer:
      "Dispositivos:\n• Añadir el biométrico con IP y puerto 4370\n• Probar conexión\n• Sincronizar: Dispositivos → “Sync”\n• Online si hay eventos en ≤30 minutos\n",
  },
];

/* ==== endpoint ==== */
router.post("/", async (req, res) => {
  try {
    const q = String(req.body.message || "").trim().toLowerCase();
    const sucursalId = req.body.sucursalId ? Number(req.body.sucursalId) : null;

    // FAQ estáticas
    for (const f of FAQ) {
      if (f.keys.some((re) => re.test(q))) {
        return res.json({ reply: f.answer });
      }
    }

    // Intents dinámicos
    if (/^resumen/.test(q) || /hoy/.test(q)) {
      const rows = await calcularAsistenciaHoy({ sucursalId });
      const conEntrada = rows.filter((r) => r.entrada).length;
      const tarde = rows.filter((r) => r.estado === "TARDE").length;
      const ausentes = rows.filter((r) => !r.entrada).length;
      const sinSalida = rows.filter((r) => r.entrada && !r.salida).length;
      const puntual = Math.max(0, conEntrada - tarde);
      const puntualidad = conEntrada ? Math.round((puntual / conEntrada) * 100) : 0;

      const parts = [
        `Resumen de hoy (${todayGT()})`,
        `• Con entrada: ${conEntrada}`,
        `• Tarde: ${tarde}`,
        `• Ausentes: ${ausentes}`,
        `• Sin salida: ${sinSalida}`,
        `• % Puntualidad: ${puntualidad}%`,
      ];
      return res.json({ reply: parts.join("\n") });
    }

    if (/tarde/.test(q)) {
      const rows = await calcularAsistenciaHoy({ sucursalId });
      const tardones = rows.filter((r) => r.estado === "TARDE");
      if (tardones.length === 0) return res.json({ reply: "Hoy no hay tardanzas ✅" });
      const lines = tardones
        .map((r) => `• ${r.nombre} (${r.sucursal}) +${r.minutosTarde}m`)
        .join("\n");
      return res.json({ reply: `Llegaron tarde:\n${lines}` });
    }

    if (/ausent/.test(q)) {
      const rows = await calcularAsistenciaHoy({ sucursalId });
      const aus = rows.filter((r) => !r.entrada);
      if (aus.length === 0) return res.json({ reply: "No hay ausentes hoy ✅" });
      const lines = aus.map((r) => `• ${r.nombre} (${r.sucursal})`).join("\n");
      return res.json({ reply: `Ausentes hoy:\n${lines}` });
    }

    if (/evento/.test(q) || /reciente/.test(q)) {
      const { startUTC, endUTC } = dayWindowUTC(todayGT());
      const w = { timestampUTC: { gte: startUTC, lte: endUTC } };
      if (sucursalId) w.dispositivo = { sucursalId: Number(sucursalId) };
      const evs = await prisma.asistenciaEvento.findMany({
        where: w,
        include: { empleado: true, dispositivo: { include: { sucursal: true } } },
        orderBy: { timestampUTC: "desc" },
        take: 6,
      });
      if (evs.length === 0) return res.json({ reply: "Sin eventos hoy." });
      const fmt = (d) =>
        new Date(d).toLocaleTimeString("es-GT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
      const lines = evs.map(
        (e) =>
          `• ${fmt(e.timestampUTC)} — ${e.empleado?.nombre} ${e.empleado?.apellido} @ ${e.dispositivo?.sucursal?.nombre || "-"}`
      );
      return res.json({ reply: `Eventos recientes:\n${lines.join("\n")}` });
    }

    // fallback
    return res.json({
      reply:
        "No te entendí. Opciones:\n" +
        "• resumen hoy\n" +
        "• tarde hoy\n" +
        "• ausentes hoy\n" +
        "• eventos recientes\n" +
        "• ayuda turnos / ayuda dispositivos",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Error interno del asistente." });
  }
});

export default router;
