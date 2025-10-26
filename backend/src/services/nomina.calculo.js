// backend/src/services/nomina.calculo.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/** "HH:MM" -> minutos */
function hhmmToMin(hhmm = "08:00") {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Duración del turno en horas (fallback 8h) */
function turnoHours(turno) {
  if (!turno) return 8;
  const ini = hhmmToMin(turno.horaEntrada);
  const fin = hhmmToMin(turno.horaSalida);
  const diffMin = Math.max(0, fin - ini);
  return Number((diffMin / 60).toFixed(2));
}

/** Suma horas por empleado dentro del período (capped por duración del turno del día) */
async function consolidarHorasEmpleado(empleadoId, inicio, fin) {
  const eventos = await prisma.asistenciaEvento.findMany({
    where: { empleadoId, timestampUTC: { gte: inicio, lte: fin } },
    orderBy: { timestampUTC: "asc" },
    select: { timestampUTC: true },
  });
  if (!eventos.length) return 0;

  const asignaciones = await prisma.turnoAsignado.findMany({
    where: { empleadoId },
    include: { turno: true },
    orderBy: { desde: "asc" },
  });

  const mapTurnoDia = (d) => {
    const t0 = new Date(d); t0.setHours(0,0,0,0);
    const t1 = new Date(d); t1.setHours(23,59,59,999);
    const asig = asignaciones
      .filter(a => a.desde <= t1 && (!a.hasta || a.hasta >= t0))
      .slice(-1)[0];
    return asig?.turno || null;
  };

  const byDay = new Map();
  for (const ev of eventos) {
    const key = ev.timestampUTC.toISOString().slice(0,10);
    const arr = byDay.get(key) || [];
    arr.push(ev.timestampUTC);
    byDay.set(key, arr);
  }

  let totalHoras = 0;
  for (const [ymd, arr] of byDay.entries()) {
    const first = arr[0], last = arr[arr.length - 1];
    let diffHrs = Math.max(0, (last - first) / 3600000);
    const turno = mapTurnoDia(new Date(ymd + "T12:00:00Z"));
    diffHrs = Math.min(diffHrs, turnoHours(turno));
    totalHoras += diffHrs;
  }
  return Number(totalHoras.toFixed(2));
}

/**
 * Calcula/actualiza la nómina (sin extras) para todos los empleados.
 * Usa meta de horas personalizada del empleado (horasMetaRef) si existe y >0;
 * si no, usa la meta definida en el período; si tampoco, 160.
 */
export async function calcularPeriodo(
  periodoId,
  { bonosGlobal = 0, descuentosGlobal = 0 } = {}
) {
  const periodo = await prisma.periodoNomina.findUnique({
    where: { id: periodoId },
  });
  if (!periodo) throw new Error("Período no encontrado");

  const empleados = await prisma.empleado.findMany({
    where: { activo: true },
    select: { id: true, salarioMensual: true, horasMetaRef: true }, // 👈 nombre correcto
  });

  const resultados = [];
  const Hperiodo = Number(periodo.horasMeta || 160);

  for (const emp of empleados) {
    const S = Number(emp.salarioMensual || 0);

    // Meta que se usará para ese empleado
    const Hemp = Number(emp.horasMetaRef || 0) > 0
      ? Number(emp.horasMetaRef)
      : Hperiodo;

    const horas = await consolidarHorasEmpleado(
      emp.id,
      periodo.inicio,
      periodo.fin
    );

    const tarifaHora = Hemp > 0 ? S / Hemp : 0;
    const Hbase = Math.min(horas, Hemp);
    const sueldoBase = Hemp > 0 ? S * (Hbase / Hemp) : 0;

    const bonos = Number(bonosGlobal || 0);
    const descuentos = Number(descuentosGlobal || 0);
    const pagoCalculado = Number((sueldoBase + bonos - descuentos).toFixed(2));

    const item = await prisma.nominaItem.upsert({
      where: {
        empleadoId_periodoId: { empleadoId: emp.id, periodoId },
      },
      update: {
        horasTrabajadas: horas,
        horasMeta: Hemp,          // se guarda la meta usada (por empleado)
        tarifaHora,
        sueldoBase,
        bonos,
        descuentos,
        pagoCalculado,
      },
      create: {
        empleadoId: emp.id,
        periodoId,
        horasTrabajadas: horas,
        horasMeta: Hemp,
        tarifaHora,
        sueldoBase,
        bonos,
        descuentos,
        pagoCalculado,
      },
      include: { empleado: true },
    });

    resultados.push(item);
  }

  return resultados;
}

export default { calcularPeriodo };
