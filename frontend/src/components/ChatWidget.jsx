// frontend/src/components/ChatWidget.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* ================== Fechas (zona GT) ================== */
const TZ = "America/Guatemala";
const ymd = (d) =>
  d.toLocaleDateString("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

// 0..6 (Lun=0, Dom=6) según zona GT
function weekdayIndexGT(d = new Date()) {
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short", // 'Mon'...'Sun'
  }).format(d);
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[w];
}
function startOfWeekGT(d = new Date()) {
  const back = weekdayIndexGT(d);
  const t = new Date(d.getTime() - back * 86400000);
  return new Date(ymd(t) + "T00:00:00-06:00");
}
function endOfWeekGT(d = new Date()) {
  const s = startOfWeekGT(d);
  return new Date(s.getTime() + 6 * 86400000);
}
function startOfMonthGT(d = new Date()) {
  const s = ymd(d).slice(0, 8) + "01";
  return new Date(s + "T00:00:00-06:00");
}
function endOfMonthGT(d = new Date()) {
  const [Y, M] = ymd(d).split("-").map(Number);
  const nextY = M === 12 ? Y + 1 : Y;
  const nextM = M === 12 ? 1 : M + 1;
  const nextFirst = new Date(
    `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01T00:00:00-06:00`
  );
  return new Date(nextFirst.getTime() - 86400000);
}
function quincenaRangeGT(d = new Date()) {
  const day = Number(
    d.toLocaleDateString("en-CA", { timeZone: TZ, day: "2-digit" })
  );
  if (day <= 15) {
    const a = startOfMonthGT(d);
    const b = new Date(ymd(a).slice(0, 8) + "15T00:00:00-06:00");
    return { from: a, to: b };
  }
  const a = new Date(ymd(d).slice(0, 8) + "16T00:00:00-06:00");
  const b = endOfMonthGT(d);
  return { from: a, to: b };
}
const rangeToYMD = ({ from, to }) => ({ from: ymd(from), to: ymd(to) });

/* ============== Selector tipo “sheet” ============== */
function SelectSheet({
  label,
  placeholder,
  items,
  getKey,
  getLabel,
  onSelect,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cw-field">
      <div className="cw-label">{label}</div>
      <button
        className="cw-chip wide"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        {placeholder}
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="cw-sheet" role="menu">
          {items.length === 0 && <div className="cw-empty">Sin opciones</div>}
          {items.map((it) => (
            <button
              key={getKey(it)}
              className="cw-sheet-item"
              onClick={() => {
                onSelect(it);
                setOpen(false);
              }}
            >
              {getLabel(it)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================== WIDGET ========================== */
export default function ChatWidget() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [open, setOpen] = useState(false);

  // pasos
  const [step, setStep] = useState(0); // 0 métrica, 1 sucursal, 2 empleado, 3 periodo, 4 resultado
  // 'horas' | 'tardanzas' | 'salidas' | 'sueldo'
  const [metric, setMetric] = useState(null);

  const [sucursales, setSucursales] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [sucursalSel, setSucursalSel] = useState(null);
  const [empleadoSel, setEmpleadoSel] = useState(null);

  // periodo / resultado
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // fechas personalizadas
  const [fromYMD, setFromYMD] = useState("");
  const [toYMD, setToYMD] = useState("");

  const title = useMemo(() => {
    switch (step) {
      case 0:
        return "Asistente";
      case 1:
        return "Selecciona la sucursal";
      case 2:
        return "Selecciona el empleado";
      case 3:
        return "Elige el periodo";
      case 4:
        return "Resultado";
      default:
        return "Asistente";
    }
  }, [step]);

  // abrir: cargar sucursales
  useEffect(() => {
    if (!open) return;
    axios
      .get(`${API_BASE}/sucursales`, { headers })
      .then(({ data }) =>
        setSucursales(Array.isArray(data) ? data : data.items || [])
      )
      .catch(() => setSucursales([]));
  }, [open]); // eslint-disable-line

  // elegir sucursal: cargar empleados activos
  useEffect(() => {
    if (!sucursalSel) return;
    setEmpleadoSel(null);
    axios
      .get(`${API_BASE}/empleados`, {
        params: { sucursalId: sucursalSel.id },
        headers,
      })
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : data.items || [];
        setEmpleados(rows.filter((e) => !!e.activo));
      })
      .catch(() => setEmpleados([]));
  }, [sucursalSel]); // eslint-disable-line

  function resetAll() {
    setStep(0);
    setMetric(null);
    setSucursalSel(null);
    setEmpleadoSel(null);
    setFromYMD("");
    setToYMD("");
    setResult(null);
    setError("");
    setLoading(false);
  }
  const chooseMetric = (m) => {
    setMetric(m);
    setStep(1);
  };
  const chooseSucursal = (s) => {
    setSucursalSel(s);
    setStep(2);
  };
  const chooseEmpleado = (e) => {
    setEmpleadoSel(e);
    setStep(3);
  };

  async function runWithRange(from, to) {
    if (!sucursalSel?.id || !empleadoSel?.id) return;
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const { data } = await axios.get(`${API_BASE}/asistencia/historial`, {
        params: { from, to, sucursalId: Number(sucursalSel.id) },
        headers,
      });
      const rows = (Array.isArray(data) ? data : data.items || []).filter(
        (r) => r.empleadoId === empleadoSel.id
      );

      // Totales de asistencia
      let horasMin = 0,
        tardanzas = 0,
        salidasTemp = 0,
        dias = 0;

      for (const r of rows) {
        if (r.entrada && r.salida) {
          const m = Math.max(
            0,
            Math.round((new Date(r.salida) - new Date(r.entrada)) / 60000)
          );
          if (m > 0) {
            horasMin += m;
            dias++;
          }
        }
        const mt = Number(r.minutosTarde || 0);
        const me = Number(r.minutosTemprano || 0);
        if (mt > 0) tardanzas++;
        if (me > 0) salidasTemp++;
      }

      const res = {
        empleado: `${empleadoSel.nombre} ${empleadoSel.apellido}`,
        sucursal: sucursalSel.nombre,
        from,
        to,
      };

      if (metric === "horas") {
        res.horas = horasMin;
        res.dias = dias;
      } else if (metric === "tardanzas") {
        res.tardanzas = tardanzas;
      } else if (metric === "salidas") {
        res.salidas = salidasTemp;
      } else if (metric === "sueldo") {
        // ====== Cálculo de sueldo estimado (sin bonos ni descuentos) ======
        const horasTrab = Number((horasMin / 60).toFixed(2));
        const S = Number(empleadoSel.salarioMensual || 0);

        // Meta de horas del empleado (compatibilidad con ambos nombres)
        const metaEmp =
          Number(
            (empleadoSel.horasMetaReferencia ??
              empleadoSel.horasMetaRef ??
              0)
          ) || 0;

        const HORAS_META_USADA = metaEmp > 0 ? metaEmp : 160; // fallback seguro

        const tarifaHora = HORAS_META_USADA > 0 ? S / HORAS_META_USADA : 0;
        const horasBase = Math.min(horasTrab, HORAS_META_USADA);
        const sueldoBase = tarifaHora * horasBase;
        const total = Number(sueldoBase.toFixed(2));

        res.sueldoTotal = total;
        res.sueldoBase = Number(sueldoBase.toFixed(2));
        res.tarifaHora = Number(tarifaHora.toFixed(2));
        res.horasTrab = horasTrab;
        res.horasBase = horasBase;
        res.horasMeta = HORAS_META_USADA; // 👈 ahora muestra la meta real del empleado
        res.salarioMensual = Number(S.toFixed(2));
      }

      setResult(res);
      setStep(4);
    } catch (e) {
      setError(
        e?.response?.data?.error || "No se pudo calcular. Revisa conexión o datos."
      );
    } finally {
      setLoading(false);
    }
  }

  function choosePeriodoQuick(kind) {
    let range;
    if (kind === "semana")
      range = { from: startOfWeekGT(), to: endOfWeekGT() };
    else if (kind === "quincena") range = quincenaRangeGT();
    else range = { from: startOfMonthGT(), to: endOfMonthGT() };
    const { from, to } = rangeToYMD(range);
    setFromYMD(from);
    setToYMD(to);
    runWithRange(from, to);
  }

  function fmtMin(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h} h ${String(m).padStart(2, "0")} m`;
  }
  function fmtQ(n) {
    return `Q ${Number(n || 0).toFixed(2)}`;
  }

  return (
    <>
      {/* FAB */}
      <button
        className="cw-fab"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) resetAll();
        }}
        aria-label="Abrir asistente"
      >
        {open ? "×" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div className="cw-panel" role="dialog" aria-modal="false">
          <div className="cw-head">
            <div className="cw-badge">A</div>
            <div className="cw-title">{title}</div>
          </div>

          <div className="cw-body">
            {/* 0 - métrica */}
            {step === 0 && (
              <>
                <div className="cw-hint">¿Qué quieres consultar?</div>
                <div className="cw-row">
                  <button className="cw-chip" onClick={() => chooseMetric("horas")}>
                    Horas trabajadas
                  </button>
                  <button className="cw-chip" onClick={() => chooseMetric("tardanzas")}>
                    Tardanzas
                  </button>
                  <button className="cw-chip" onClick={() => chooseMetric("salidas")}>
                    Salidas tempranas
                  </button>
                  <button className="cw-chip" onClick={() => chooseMetric("sueldo")}>
                    Sueldo estimado
                  </button>
                </div>
                <div className="cw-note">
                  Flujo: sucursal → empleado → periodo (o fechas).
                </div>
              </>
            )}

            {/* 1 - sucursal */}
            {step === 1 && (
              <>
                <div className="cw-prompt">
                  Selecciona la <b>sucursal</b> para continuar.
                </div>
                <SelectSheet
                  label="Sucursal"
                  placeholder={
                    sucursalSel ? sucursalSel.nombre : "Elegir sucursal…"
                  }
                  items={sucursales}
                  getKey={(s) => s.id}
                  getLabel={(s) => s.nombre}
                  onSelect={chooseSucursal}
                />
                <div className="cw-actions">
                  <button className="cw-btn" onClick={() => setStep(0)}>
                    Atrás
                  </button>
                </div>
              </>
            )}

            {/* 2 - empleado */}
            {step === 2 && (
              <>
                <div className="cw-prompt">
                  Sucursal: <b>{sucursalSel?.nombre}</b>. Ahora elige el{" "}
                  <b>empleado</b>.
                </div>
                <SelectSheet
                  label="Empleado"
                  placeholder={
                    empleadoSel
                      ? `${empleadoSel.nombre} ${empleadoSel.apellido}`
                      : "Elegir empleado…"
                  }
                  items={empleados}
                  getKey={(e) => e.id}
                  getLabel={(e) => {
                    const metaEmp =
                      Number(e.horasMetaReferencia ?? e.horasMetaRef ?? 0) || 160;
                    const sueldo =
                      e.salarioMensual != null ? ` — ${fmtQ(e.salarioMensual)}` : "";
                    return `${e.nombre} ${e.apellido} (${e.codigo})${sueldo} · ${metaEmp}h`;
                  }}
                  onSelect={chooseEmpleado}
                  disabled={!sucursalSel}
                />
                <div className="cw-actions">
                  <button className="cw-btn" onClick={() => setStep(1)}>
                    Atrás
                  </button>
                </div>
              </>
            )}

            {/* 3 - periodo + fechas */}
            {step === 3 && (
              <>
                <div className="cw-prompt">
                  Consulta para <b>{empleadoSel?.nombre} {empleadoSel?.apellido}</b> en{" "}
                  <b>{sucursalSel?.nombre}</b>. Elige un periodo rápido o ingresa
                  fechas:
                </div>

                <div className="cw-row">
                  <button className="cw-chip" onClick={() => choosePeriodoQuick("semana")}>
                    Semana actual
                  </button>
                  <button className="cw-chip" onClick={() => choosePeriodoQuick("quincena")}>
                    Quincena actual
                  </button>
                  <button className="cw-chip" onClick={() => choosePeriodoQuick("mes")}>
                    Mes actual
                  </button>
                </div>

                <div className="cw-field">
                  <div className="cw-label">Rango personalizado</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="date"
                      value={fromYMD}
                      onChange={(e) => setFromYMD(e.target.value)}
                      className="cw-input"
                    />
                    <input
                      type="date"
                      value={toYMD}
                      onChange={(e) => setToYMD(e.target.value)}
                      className="cw-input"
                    />
                  </div>
                  <div className="cw-actions" style={{ marginTop: 8 }}>
                    <button
                      className="cw-btn"
                      onClick={() => runWithRange(fromYMD, toYMD)}
                      disabled={!fromYMD || !toYMD}
                    >
                      Calcular con estas fechas
                    </button>
                  </div>
                </div>

                {loading && <div className="cw-loading">Calculando…</div>}
                {error && <div className="cw-error">{error}</div>}
                <div className="cw-actions">
                  <button className="cw-btn" onClick={() => setStep(2)}>
                    Atrás
                  </button>
                </div>
              </>
            )}

            {/* 4 - resultado */}
            {step === 4 && result && (
              <>
                <div className="cw-summary">
                  <div className="cw-line">
                    <b>{result.empleado}</b> — {result.sucursal}
                  </div>
                  <div className="cw-sub">
                    Del {result.from} al {result.to}
                  </div>
                </div>

                {metric === "horas" && (
                  <div className="cw-card">
                    <div className="cw-kpi">{fmtMin(result.horas || 0)}</div>
                    <div className="cw-kpi-label">Horas trabajadas</div>
                    <div className="cw-sub">Días con registro: {result.dias || 0}</div>
                  </div>
                )}
                {metric === "tardanzas" && (
                  <div className="cw-card">
                    <div className="cw-kpi">{result.tardanzas || 0}</div>
                    <div className="cw-kpi-label">Tardanzas</div>
                  </div>
                )}
                {metric === "salidas" && (
                  <div className="cw-card">
                    <div className="cw-kpi">{result.salidas || 0}</div>
                    <div className="cw-kpi-label">Salidas tempranas</div>
                  </div>
                )}
                {metric === "sueldo" && (
                  <div className="cw-card">
                    <div className="cw-kpi">{fmtQ(result.sueldoTotal || 0)}</div>
                    <div className="cw-kpi-label">Sueldo estimado del período</div>

                    <div className="cw-sub" style={{ marginTop: 6 }}>
                      Sueldo base: <b>{fmtQ(result.sueldoBase)}</b>
                    </div>

                    <div className="cw-sub">
                      Tarifa: <b>{fmtQ(result.tarifaHora)}/h</b> — Horas:
                      <b> {fmtMin(Math.round((result.horasTrab || 0) * 60))}</b>
                      {" "}({result.horasTrab} h) · usadas{" "}
                      <b>{fmtMin(Math.round((result.horasBase || 0) * 60))}</b>
                      {" "} / meta <b>{result.horasMeta}</b>
                    </div>

                    <div className="cw-sub">
                      Salario mensual (base): <b>{fmtQ(result.salarioMensual)}</b>
                    </div>
                  </div>
                )}

                <div className="cw-actions">
                  <button className="cw-btn" onClick={() => setStep(3)}>
                    Cambiar periodo
                  </button>
                  <button className="cw-btn" onClick={resetAll}>
                    Nueva consulta
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Estilos */}
      <style>{`
        .cw-fab{
          position:fixed; right:18px; bottom:18px; z-index:10050;
          width:56px; height:56px; border-radius:16px;
          border:1px solid rgba(2,6,23,.14);
          background:linear-gradient(135deg,#3b82f6,#10b981);
          color:#fff; font-size:22px; font-weight:900; cursor:pointer;
          box-shadow:0 16px 38px rgba(2,6,23,.25);
        }
        .cw-panel{
          position:fixed; right:18px; bottom:calc(84px + env(safe-area-inset-bottom,0px));
          z-index:10050;
          width:min(380px,92vw); max-height:88vh;
          background:#fff; border:1px solid #e5e7eb; border-radius:16px;
          box-shadow:0 28px 80px rgba(2,6,23,.35);
          display:flex; flex-direction:column; overflow:hidden;
        }
        .cw-head{
          display:flex; align-items:center; gap:8px; padding:10px 12px;
          border-bottom:1px solid #e5e7eb;
          background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.90));
        }
        .cw-badge{ width:28px; height:28px; border-radius:8px; display:grid; place-items:center;
          font-weight:900; color:#fff; background:linear-gradient(135deg,#6366f1,#10b981); }
        .cw-title{ font-weight:900; }

        .cw-body{ padding:12px; overflow:auto; }
        .cw-hint{ color:#475569; margin-bottom:8px; }
        .cw-note{ color:#64748b; font-size:12px; margin-top:6px; }
        .cw-row{ display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
        .cw-chip{
          appearance:none; border:none; border-radius:999px; padding:8px 12px;
          font-weight:800; cursor:pointer; background:#f1f5f9;
        }
        .cw-chip.wide{ width:100%; display:flex; justify-content:space-between; align-items:center; }
        .caret{ margin-left:10px; opacity:.65; }

        .cw-field{ margin:10px 0; position:relative; }
        .cw-label{ font-size:12px; font-weight:800; color:#475569; margin-bottom:6px; }
        .cw-prompt{ margin:6px 0 10px; color:#0f172a; }
        .cw-actions{ display:flex; gap:8px; margin-top:8px; }
        .cw-btn{
          padding:8px 10px; border:1px solid #e5e7eb; background:#fff;
          border-radius:10px; font-weight:700; cursor:pointer;
        }
        .cw-input{
          width:100%; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb;
          background:#fff; outline:none;
        }
        .cw-sheet{
          position:absolute; left:0; right:0; top:100%; margin-top:6px; z-index:20000;
          background:#fff; border:1px solid #e5e7eb; border-radius:12px;
          box-shadow:0 16px 48px rgba(2,6,23,.20);
          max-height:260px; overflow:auto; padding:6px;
        }
        .cw-sheet-item{
          width:100%; text-align:left; border:none; background:#fff; border-radius:8px;
          padding:8px 10px; cursor:pointer;
        }
        .cw-sheet-item:hover{ background:#f8fafc; }
        .cw-empty{ color:#64748b; font-size:13px; padding:8px; }

        .cw-loading{ color:#475569; margin-top:8px; }
        .cw-error{
          color:#991b1b; background:rgba(239,68,68,.08);
          border:1px solid rgba(239,68,68,.35); padding:8px 10px;
          border-radius:10px; margin-top:8px;
        }

        .cw-summary{ margin:6px 0 8px; }
        .cw-line{ font-weight:800; }
        .cw-sub{ color:#64748b; font-size:12px; }

        .cw-card{ margin-top:8px; border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#f8fafc; }
        .cw-kpi{ font-size:26px; font-weight:900; }
        .cw-kpi-label{ color:#475569; font-weight:800; }
      `}</style>
    </>
  );
}
