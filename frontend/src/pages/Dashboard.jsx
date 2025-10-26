// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* ================= Helpers ================= */
const tz = { timeZone: "America/Guatemala" };
const fmtTime = (d) =>
  d?.toLocaleTimeString("es-GT", { ...tz, hour: "2-digit", minute: "2-digit", hour12: true }) || "-";
const fmtDate = (d) =>
  d?.toLocaleDateString("es-GT", { ...tz, year: "numeric", month: "2-digit", day: "2-digit" }) || "-";
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const niceToday = () =>
  new Date().toLocaleDateString("es-GT", { ...tz, weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export default function Dashboard() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // filtros
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState("");

  // KPIs
  const [empleadosActivos, setEmpleadosActivos] = useState(0);
  const [diaria, setDiaria] = useState([]);
  const [loadingKpis, setLoadingKpis] = useState(false);

  // eventos y dispositivos
  const [eventos, setEventos] = useState([]);
  const [dispositivos, setDispositivos] = useState([]);

  // tendencias (historial)
  const [rangeDays, setRangeDays] = useState(7);
  const [historial, setHistorial] = useState([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // ML
  const [preds, setPreds] = useState([]);
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [winners, setWinners] = useState([]);
  const [loadingWinners, setLoadingWinners] = useState(false);

  // UI: ausentes
  const [showAusentes, setShowAusentes] = useState(false);

  /* ========== cargar sucursales ========== */
  useEffect(() => {
    axios
      .get(`${API_BASE}/sucursales`, { headers })
      .then(({ data }) => setSucursales(Array.isArray(data) ? data : data.items || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ========== KPIs del día + tablas rápidas ========== */
  async function loadToday() {
    setLoadingKpis(true);
    try {
      const paramsEmp = {};
      if (sucursalId) paramsEmp.sucursalId = Number(sucursalId);
      const empRes = await axios.get(`${API_BASE}/empleados`, { params: paramsEmp, headers });
      const empleados = Array.isArray(empRes.data) ? empRes.data : empRes.data.items || [];
      setEmpleadosActivos(empleados.filter((e) => !!e.activo).length);

      const paramsDia = {};
      if (sucursalId) paramsDia.sucursalId = Number(sucursalId);
      const { data: dia } = await axios.get(`${API_BASE}/asistencia/diaria`, { params: paramsDia, headers });
      setDiaria(Array.isArray(dia) ? dia : dia.items || []);

      const paramsEv = { limit: 10 };
      if (sucursalId) paramsEv.sucursalId = Number(sucursalId);
      axios
        .get(`${API_BASE}/asistencia/eventos`, { params: paramsEv, headers })
        .then(({ data }) => setEventos(Array.isArray(data) ? data : data.items || []))
        .catch(() => {});

      axios
        .get(`${API_BASE}/dispositivos`, { headers })
        .then(({ data }) => setDispositivos(Array.isArray(data) ? data : data.items || []))
        .catch(() => {});
    } finally {
      setLoadingKpis(false);
    }
  }
  useEffect(() => {
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  /* ========== Tendencias (7/30 días) ========== */
  async function loadTrends() {
    setLoadingTrends(true);
    try {
      const to = todayISO();
      const from = isoDaysAgo(rangeDays - 1);
      const params = { from, to };
      if (sucursalId) params.sucursalId = Number(sucursalId);
      const { data } = await axios.get(`${API_BASE}/asistencia/historial`, { params, headers });
      setHistorial(Array.isArray(data) ? data : data.items || []);
    } finally {
      setLoadingTrends(false);
    }
  }
  useEffect(() => {
    loadTrends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, sucursalId]);

  /* ========== ML: Predicciones de tardanza (CASOS FUERTES) ========== */
  async function loadPreds() {
    setLoadingPreds(true);
    try {
      const params = {
        days: 7,
        threshold: 0.6, // ≥ 60% prob.
        minObs: 2,      // mínimo 2 observaciones del mismo día de semana
        learnDays: 365, // usa 12 meses de historial
      };
      if (sucursalId) params.sucursalId = Number(sucursalId);
      const { data } = await axios.get(`${API_BASE}/ml/tardanza/proximos`, { params, headers });
      setPreds(Array.isArray(data) ? data : data.items || []);
    } finally {
      setLoadingPreds(false);
    }
  }

  /* ========== ML: Más puntuales por sucursal (top 1) ========== */
  async function loadWinners() {
    setLoadingWinners(true);
    try {
      const params = { days: 30, top: 1 };
      if (sucursalId) params.sucursalId = Number(sucursalId);
      const { data } = await axios.get(`${API_BASE}/ml/puntual/top`, { params, headers });
      setWinners(Array.isArray(data) ? data : data.items || []);
    } finally {
      setLoadingWinners(false);
    }
  }

  useEffect(() => {
    loadPreds();
    loadWinners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId]);

  /* ========== KPIs calculados ========== */
  const kpis = useMemo(() => {
    const conEntrada = diaria.filter((r) => !!r.entrada).length;
    const conSalida = diaria.filter(
      (r) => !!r.entrada && !!r.salida && new Date(r.salida) > new Date(r.entrada)
    ).length;

    const tarde = diaria.filter((r) => Number(r.minutosTarde || 0) > 0).length;
    const salidasTempranas = diaria.filter((r) => Number(r.minutosTemprano || 0) > 0).length;

    const ausentes = diaria.filter((r) => !r.entrada).length;
    const sinSalida = diaria.filter((r) => !!r.entrada && !r.salida).length;

    const puntual = diaria.filter(
      (r) => !!r.entrada && Number(r.minutosTarde || 0) <= 0 && Number(r.minutosTemprano || 0) <= 0
    ).length;

    const puntualidad = conEntrada ? Math.round((puntual / conEntrada) * 100) : 0;

    return { conEntrada, conSalida, tarde, salidasTempranas, ausentes, sinSalida, puntualidad };
  }, [diaria]);

  /* ========== Auxiliares ========== */
  const ausentesHoyLista = useMemo(
    () => diaria.filter((r) => !r.entrada).map((r) => r.empleadoNombre),
    [diaria]
  );

  const topAusentes = useMemo(() => {
    const m = new Map();
    for (const r of historial) {
      if ((r.estado || "").toUpperCase() === "INA") {
        const key = `${r.empleadoId}|${r.empleadoNombre}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([k, v]) => ({ empleado: k.split("|")[1], ausencias: v }))
      .sort((a, b) => b.ausencias - a.ausencias)
      .slice(0, 5);
  }, [historial]);

  const trendDaily = useMemo(() => {
    const byDate = new Map();
    for (const r of historial) {
      const f = r.fecha || new Date(r.entrada || r.salida || Date.now()).toISOString().slice(0, 10);
      if (!byDate.has(f)) byDate.set(f, { conEntrada: 0, tarde: 0 });
      if (r.entrada) {
        byDate.get(f).conEntrada++;
        if (Number(r.minutosTarde || 0) > 0) byDate.get(f).tarde++;
      }
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([fecha, v]) => ({
        fecha,
        pct: v.conEntrada ? Math.round(((v.conEntrada - v.tarde) / v.conEntrada) * 100) : 0,
      }));
  }, [historial]);

  const trendSucursal = useMemo(() => {
    const agg = new Map();
    for (const r of historial) {
      const key = r.sucursalNombre || "—";
      if (!agg.has(key)) agg.set(key, { puntual: 0, tarde: 0, ausentes: 0, total: 0 });
      const row = agg.get(key);

      if (r.entrada) {
        if (Number(r.minutosTarde || 0) > 0) row.tarde++;
        else if (Number(r.minutosTarde || 0) <= 0 && Number(r.minutosTemprano || 0) <= 0) row.puntual++;
      } else if ((r.estado || "").toUpperCase() === "INA") {
        row.ausentes++;
      }
      row.total++;
    }
    return [...agg.entries()]
      .map(([suc, v]) => ({ sucursal: suc, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [historial]);

  const heatmap = useMemo(() => {
    const arr = Array.from({ length: 24 }, () => 0);
    for (const r of historial) {
      if (!r.entrada) continue;
      const h = new Date(r.entrada).toLocaleString("es-GT", { ...tz, hour: "2-digit", hour12: false });
      const hour = Number(h);
      if (Number.isFinite(hour)) arr[hour] += 1;
    }
    const max = Math.max(1, ...arr);
    return { values: arr, max };
  }, [historial]);

  const topTardones = useMemo(() => {
    const m = new Map();
    for (const r of historial) {
      if (Number(r.minutosTarde || 0) > 0) {
        const key = `${r.empleadoId}|${r.empleadoNombre}`;
        m.set(key, (m.get(key) || 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([k, v]) => ({ empleado: k.split("|")[1], tardanzas: v }))
      .sort((a, b) => b.tardanzas - a.tardanzas)
      .slice(0, 5);
  }, [historial]);

  /* ================= Render ================= */
  return (
    <div style={{ padding: 12 }}>
      {/* HEADER (simple y pegado arriba) */}
      <header className="card header" style={{ padding: 14, position: "sticky", top: 8, zIndex: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="brand-dot" />
          <div style={{ fontWeight: 900 }}>
            <div style={{ fontSize: 18 }}>Panel de Asistencia</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{niceToday()}</div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            <div className="field-inline">
              <label>Sucursal</label>
              <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                <option value="">Todas</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-chip btn-emerald" onClick={loadToday}>↻ Refrescar</button>
          </div>
        </div>
      </header>

      {/* ======== TODO VERTICAL (una sola columna) ======== */}

      {/* KPIs HOY */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Hoy</h3>
          <span className="hint">Resumen del día</span>
        </div>

        {/* KPIs */}
        <div className="kpi-row">
          <KPI icon="👥" tone="slate" title="Empleados activos" value={empleadosActivos} loading={loadingKpis} />
          <KPI icon="✅" tone="emerald" title="Con entrada" value={kpis.conEntrada} loading={loadingKpis} />
          <KPI icon="📤" tone="blue"    title="Con salida"   value={kpis.conSalida}  loading={loadingKpis} />
          <KPI icon="⏰" tone="amber"   title="Tarde" value={kpis.tarde} loading={loadingKpis} />
          <KPI icon="🏃" tone="rose"    title="Salidas tempranas" value={kpis.salidasTempranas} loading={loadingKpis} />
          <KPI icon="🚫" tone="muted"   title="Ausentes" value={kpis.ausentes} loading={loadingKpis} />
          <KPI icon="📤" tone="rose"    title="Sin salida" value={kpis.sinSalida} loading={loadingKpis} />
          <KPI icon="🏁" tone="blue"    title="% Puntualidad" value={`${kpis.puntualidad}%`} loading={loadingKpis} />
        </div>

        {/* Ausentes hoy */}
        <div className="ausentes-bar">
          <span className="chip-count">
            Ausentes hoy: <strong>{kpis.ausentes}</strong>
          </span>
          {kpis.ausentes > 0 && (
            <button className="btn-link" onClick={() => setShowAusentes((v) => !v)}>
              {showAusentes ? "Ocultar lista" : "Ver lista"}
            </button>
          )}
        </div>

        {showAusentes && kpis.ausentes > 0 && (
          <div className="ausentes-list">
            {chunk(ausentesHoyLista.sort(), 3).map((col, i) => (
              <ul key={i}>
                {col.map((name, j) => (
                  <li key={j}>{name}</li>
                ))}
              </ul>
            ))}
          </div>
        )}
      </section>

      {/* EVENTOS RECIENTES */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Eventos recientes</h3>
          <span className="hint">Últimos 10 registros</span>
        </div>
        <TableEvents rows={eventos} highlightSucursalId={sucursalId} />
      </section>

      {/* DISPOSITIVOS */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Dispositivos</h3>
          <span className="hint">Estado por sucursal</span>
        </div>
        <TableDispositivos rows={dispositivos} sucursalId={sucursalId} />
      </section>

      {/* TENDENCIAS */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Tendencias</h3>
        <div className="tabs">
            <button
              className={`btn-chip ${rangeDays === 7 ? "btn-emerald" : "btn-slate"}`}
              onClick={() => setRangeDays(7)}
            >
              7 días
            </button>
            <button
              className={`btn-chip ${rangeDays === 30 ? "btn-emerald" : "btn-slate"}`}
              onClick={() => setRangeDays(30)}
            >
              30 días
            </button>
          </div>
        </div>

        {loadingTrends ? (
          <div className="skeleton-block">Cargando…</div>
        ) : (
          <>
            <div className="trend-card">
              <div className="trend-title">% Puntualidad por día</div>
              <MiniLine data={trendDaily} />
            </div>

            <div className="trend-card">
              <div className="trend-title">Distribución por sucursal</div>
              <StackedBars data={trendSucursal} />
            </div>

            <div className="trend-card">
              <div className="trend-title">Entradas por hora</div>
              <Heatmap hours={heatmap.values} max={heatmap.max} />
            </div>

            <div className="trend-card">
              <div className="trend-title">Top 5 tardanzas</div>
              <TopList rows={topTardones} />
            </div>

            <div className="trend-card">
              <div className="trend-title">Top ausencias (últimos {rangeDays} días)</div>
              <TopAusencias rows={topAusentes} />
            </div>
          </>
        )}
      </section>

      {/* PREDICCIÓN: TARDANZAS PRÓXIMOS 7 DÍAS */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Predicción de tardanzas (próx. 7 días)</h3>
          <span className="hint">Modelo base por frecuencia histórica del mismo día de la semana</span>
        </div>

        {/* LEYENDA EXPLICATIVA */}
        <div className="info-callout">
          <div className="info-title">¿Cómo se calcula?</div>
          <ul>
            <li><strong>obs</strong>: cuántas veces, en el historial, existe registro para ese <em>mismo día de la semana</em> (p. ej. todos los lunes).</li>
            <li><strong>tardanzas</strong>: de esas <em>obs</em>, cuántas fueron llegando tarde.</li>
            <li><strong>% prob.</strong> = <code>tardanzas / obs</code>. Solo mostramos <strong>casos fuertes</strong>: al menos <strong>2 obs</strong> y probabilidad <strong>≥ 60%</strong> usando el último año.</li>
          </ul>
        </div>

        {loadingPreds ? (
          <div className="skeleton-block">Cargando…</div>
        ) : preds.length === 0 ? (
          <div style={{ color: "#64748b" }}>Sin alertas de tardanza con suficiente evidencia.</div>
        ) : (
          <PredList items={preds} />
        )}
      </section>

      {/* MÁS PUNTUALES POR SUCURSAL (TOP 1) */}
      <section className="card block" style={{ padding: 14 }}>
        <div className="section-head">
          <h3>Más puntuales por sucursal</h3>
          <span className="hint">Top 1 por sucursal, últimos 30 días</span>
        </div>

        {loadingWinners ? (
          <div className="skeleton-block">Cargando…</div>
        ) : winners.length === 0 ? (
          <div style={{ color: "#64748b" }}>Sin datos</div>
        ) : (
          <WinnersList rows={winners} />
        )}
      </section>

      {/* estilos locales */}
      <style>{`
        .card{
          background:#fff; border:1px solid #e5e7eb; border-radius:16px;
          box-shadow:0 6px 18px rgba(2,6,23,.06);
        }
        .header .brand-dot{
          width:38px; height:38px; border-radius:999px;
          background: radial-gradient(circle at 30% 30%, #22c55e, #16a34a);
          box-shadow: 0 6px 16px rgba(34,197,94,.35), inset 0 0 20px rgba(255,255,255,.25);
        }
        .field-inline{ display:flex; flex-direction:column; gap:4px; }
        .field-inline > label{ font-size:12px; color:#475569; font-weight:800; }
        .field-inline > select{
          padding:10px; border-radius:10px; border:1px solid #e5e7eb; min-width:200px; outline:none; background:#fff;
        }

        /* UNA SOLA COLUMNA (todo apilado) */
        .block{ margin: 12px 0; }

        .section-head{
          display:flex; align-items:center; gap:10px; margin-bottom:10px;
        }
        .section-head h3{ margin:0; font-size:16px; font-weight:900; }
        .section-head .hint{ color:#64748b; font-size:12px; font-weight:700; }
        .section-head .tabs{ margin-left:auto; display:flex; gap:6px; }

        .kpi-row{
          display:flex; flex-wrap:wrap; gap:10px;
        }
        .kpi{
          min-width: 190px;
          flex: 1 1 220px;
          padding:14px; border-radius:12px; border:1px solid #e5e7eb;
          background:linear-gradient(180deg,#f8fafc, #ffffff);
          display:flex; align-items:center; gap:10px;
        }
        .kpi .ic{ width:36px; height:36px; border-radius:12px; display:grid; place-items:center; font-size:18px; font-weight:900; }
        .kpi .meta{ display:flex; flex-direction:column; }
        .kpi .meta .label{ color:#64748b; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.4px;}
        .kpi .meta .value{ font-size:22px; font-weight:900; color:#0f172a; }

        .kpi.slate .ic{ background:#f1f5f9; color:#0f172a; }
        .kpi.emerald .ic{ background:rgba(16,185,129,.12); color:#065f46; }
        .kpi.amber .ic{ background:rgba(245,158,11,.12); color:#92400e; }
        .kpi.muted .ic{ background:rgba(100,116,139,.12); color:#334155; }
        .kpi.rose .ic{ background:rgba(244,63,94,.12); color:#881337; }
        .kpi.blue .ic{ background:rgba(59,130,246,.12); color:#1d4ed8; }

        .ausentes-bar{
          display:flex; align-items:center; gap:10px; margin-top:10px;
        }
        .chip-count{
          padding:6px 10px; border-radius:999px; font-size:12px; font-weight:900;
          background:rgba(100,116,139,.10); border:1px solid rgba(100,116,139,.35); color:#334155;
        }
        .btn-link{
          background:transparent; border:none; color:#2563eb; font-weight:800; cursor:pointer; padding:4px 6px;
        }
        .ausentes-list{
          display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px;
          padding:10px; border:1px dashed #e5e7eb; border-radius:10px; margin-top:8px; background:#f8fafc;
        }
        @media (max-width: 720px){ .ausentes-list{ grid-template-columns: repeat(2, minmax(0,1fr)); } }
        .ausentes-list ul{ margin:0; padding-left:18px; }
        .ausentes-list li{ margin:2px 0; font-weight:700; color:#0f172a; }

        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:900;
          box-shadow:0 4px 14px rgba(2,6,23,.10); cursor:pointer; transition:transform .05s, filter .12s;
          display:inline-flex; align-items:center; justify-content:center; height:36px; line-height:1;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-emerald{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff; }
        .btn-slate{ background:#475569; color:#fff; }

        .table-wrap{ overflow-x:auto; }
        table{ width:100%; border-collapse:collapse; }
        thead tr{ background:#f1f5f9; }
        th, td{ padding:10px; border-top:1px solid #e5e7eb; }
        th{ text-align:left; font-size:12px; letter-spacing:.3px; color:#334155; }
        td .sub{ font-size:12px; color:#64748b; }

        .badge{
          padding:4px 10px; border-radius:999px; font-size:12px; font-weight:800; border:1px solid transparent; white-space:nowrap;
        }
        .badge.ok{ background:rgba(16,185,129,.12); border-color:rgba(16,185,129,.35); color:#065f46; }
        .badge.warn{ background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.35); color:#92400e; }
        .badge.err{ background:rgba(239,68,68,.12); border-color:rgba(239,68,68,.35); color:#991b1b; }

        .skeleton-block{
          height:120px; border:1px dashed #e5e7eb; border-radius:12px; display:grid; place-items:center; color:#64748b;
          background: repeating-linear-gradient( -45deg, #f8fafc, #f8fafc 10px, #ffffff 10px, #ffffff 20px);
        }

        .trend-card{ border:1px solid #e5e7eb; border-radius:12px; padding:10px; background:#fff; margin-bottom:10px; }
        .trend-title{ font-weight:900; margin-bottom:6px; }

        /* legend chips */
        .legend-chip{ padding:4px 8px; border-radius:999px; font-weight:800; border:1px solid #e5e7eb; }
        .lg-green{ background:rgba(16,185,129,.12); color:#065f46; }
        .lg-amber{ background:rgba(245,158,11,.12); color:#92400e; }
        .lg-muted{ background:rgba(100,116,139,.12); color:#334155; }

        /* segmentos */
        .seg{ position:relative; display:grid; place-items:center; }
        .seg-green{ background:rgba(16,185,129,.7); }
        .seg-amber{ background:rgba(245,158,11,.8); }
        .seg-muted{ background:rgba(100,116,139,.6); }

        /* números debajo de cada barra */
        .bar-numbers{ display:flex; gap:12px; flex-wrap:wrap; font-size:12px; }
        .bar-numbers .num{ font-weight:700; }
        .bar-numbers .num.green{ color:#065f46; }
        .bar-numbers .num.amber{ color:#92400e; }
        .bar-numbers .num.muted{ color:#334155; }

        /* chips extras */
        .chip{ border:1px solid #e5e7eb; border-radius:999px; padding:6px 10px; font-weight:900; }
        .chip-green{ background:rgba(16,185,129,.12); color:#065f46; }

        /* ML leyenda */
        .info-callout{
          border:1px solid #e5e7eb; border-radius:12px; padding:10px; background:#f8fafc; margin-bottom:10px;
          color:#0f172a;
        }
        .info-title{ font-weight:900; margin-bottom:6px; }
        .info-callout ul{ margin:0; padding-left:18px; }
        .info-callout li{ margin:3px 0; font-size:13px; }
        .info-callout code{ background:#e5e7eb; border-radius:6px; padding:0 6px; font-weight:900; }
      `}</style>
    </div>
  );
}

/* ===================== Subcomponentes ===================== */
function KPI({ title, value, tone = "slate", loading, icon }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="ic">{icon || "•"}</div>
      <div className="meta">
        <div className="label">{title}</div>
        <div className="value">{loading ? "…" : value}</div>
      </div>
    </div>
  );
}

function TableEvents({ rows, highlightSucursalId }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha/Hora</th>
            <th>Empleado</th>
            <th>Sucursal</th>
            <th>Dispositivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = r.timestampUTC ? new Date(r.timestampUTC) : null;
            const emp = r.empleado ? `${r.empleado.nombre} ${r.empleado.apellido}` : `ID ${r.empleadoId}`;
            const suc = r.dispositivo?.sucursal?.nombre || "-";
            const isHi =
              highlightSucursalId && Number(highlightSucursalId) === (r.dispositivo?.sucursalId ?? -1);
            return (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{t ? `${fmtDate(t)} ${fmtTime(t)}` : "-"}</td>
                <td>
                  <div style={{ fontWeight: 900 }}>{emp}</div>
                  <div className="sub">(EMPID {r.empleadoId})</div>
                </td>
                <td style={{ fontWeight: isHi ? 900 : 600 }}>{suc}</td>
                <td>{r.dispositivo?.nombre || "-"}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
                Sin datos
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TableDispositivos({ rows, sucursalId }) {
  const nowSec = Math.floor(Date.now() / 1000);
  const filtered = rows.filter((d) => !sucursalId || Number(sucursalId) === d.sucursalId);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>IP</th>
            <th>Puerto</th>
            <th>Sucursal</th>
            <th>Últ. evento</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => {
            const last = d.ultimoEventoUnix ? new Date(d.ultimoEventoUnix * 1000) : null;
            const ageMin = d.ultimoEventoUnix ? Math.round((nowSec - d.ultimoEventoUnix) / 60) : null;
            const online = ageMin != null && ageMin <= 30;
            const badge =
              ageMin == null
                ? { cls: "badge err", text: "Sin datos" }
                : online
                ? { cls: "badge ok", text: "Online" }
                : { cls: "badge warn", text: "Inactivo" };
            return (
              <tr key={d.id}>
                <td style={{ fontWeight: 900 }}>{d.nombre}</td>
                <td align="center">{d.ip}</td>
                <td align="center">{d.puerto}</td>
                <td>{d.sucursal?.nombre || "-"}</td>
                <td align="center">{last ? `${fmtDate(last)} ${fmtTime(last)}` : "-"}</td>
                <td align="center"><span className={badge.cls}>{badge.text}</span></td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#64748b" }}>
                Sin dispositivos
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ===== Micro-gráficos sin librerías ===== */
function MiniLine({ data }) {
  const w = Math.max(260, data.length * 36);
  const h = 90;
  const pad = 12;
  const points =
    data.length === 0
      ? ""
      : data
          .map((d, i) => {
            const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
            const y = pad + (1 - d.pct / 100) * (h - pad * 2);
            return `${x},${y}`;
          })
          .join(" ");
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={w} height={h} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}>
        {[0, 25, 50, 75, 100].map((p) => {
          const y = pad + (1 - p / 100) * (h - pad * 2);
          return <line key={p} x1={pad} y1={y} x2={w - pad} stroke="#eef2f7" />;
        })}
        {points && <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />}
        {data.map((d, i) => {
          const x = pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
          const y = pad + (1 - d.pct / 100) * (h - pad * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill="#3b82f6" />;
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b", marginTop: 6, flexWrap: "wrap" }}>
        {data.map((d) => (
          <span key={d.fecha}>
            {d.fecha}: {d.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

// Barras apiladas (puntual/tarde/ausentes) por sucursal con porcentajes visibles
function StackedBars({ data }) {
  if (data.length === 0) return <div style={{ color: "#64748b" }}>Sin datos</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* Leyenda */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
        <span className="legend-chip lg-green">Puntual</span>
        <span className="legend-chip lg-amber">Tarde</span>
        <span className="legend-chip lg-muted">Ausente</span>
      </div>

      {data.map((r) => {
        const { puntual, tarde, ausentes, total } = r;
        const pP = total ? Math.round((puntual / total) * 100) : 0;
        const pT = total ? Math.round((tarde / total) * 100) : 0;
        const pA = Math.max(0, 100 - pP - pT);

        return (
          <div key={r.sucursal} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <strong>{r.sucursal}</strong>
              <span style={{ color: "#64748b" }}>{total} reg.</span>
            </div>

            {/* Barra SIN textos dentro */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${pP}% ${pT}% ${pA}%`,
                height: 16,
                borderRadius: 999,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
              }}
            >
              <div className="seg seg-green" />
              <div className="seg seg-amber" />
              <div className="seg seg-muted" />
            </div>

            {/* Porcentajes debajo */}
            <div className="bar-numbers">
              <span className="num green">Puntual: <strong>{pP}%</strong></span>
              <span className="num amber">Tarde: <strong>{pT}%</strong></span>
              <span className="num muted">Ausente: <strong>{pA}%</strong></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({ hours, max }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 4 }}>
      {hours.map((v, i) => {
        const alpha = max ? 0.15 + (0.85 * v) / max : 0.15;
        return (
          <div
            key={i}
            title={`${String(i).padStart(2, "0")}:00 — ${v}`}
            style={{
              height: 22,
              borderRadius: 6,
              background: `rgba(59,130,246,${alpha})`,
              border: "1px solid #e5e7eb",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              color: "#0f172a",
            }}
          >
            {i}
          </div>
        );
      })}
    </div>
  );
}

function TopList({ rows }) {
  if (rows.length === 0) return <div style={{ color: "#64748b" }}>Sin tardanzas</div>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          <div style={{ fontWeight: 900 }}>{r.empleado}</div>
          <div style={{ color: "#92400e", fontWeight: 900 }}>{r.tardanzas}</div>
        </div>
      ))}
    </div>
  );
}

function TopAusencias({ rows }) {
  if (rows.length === 0) return <div style={{ color: "#64748b" }}>Sin ausencias</div>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          <div style={{ fontWeight: 900 }}>{r.empleado}</div>
          <div style={{ color: "#991b1b", fontWeight: 900 }}>{r.ausencias}</div>
        </div>
      ))}
    </div>
  );
}

/* ====== Predicciones UI ====== */
function PredList({ items = [] }) {
  // agrupar por fecha
  const byDate = items.reduce((acc, p) => {
    (acc[p.fechaISO] ||= []).push(p);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {dates.map((d) => (
        <div key={d} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{d}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {byDate[d]
              .sort((a, b) => b.prob - a.prob || b.obs - a.obs || a.empleadoNombre.localeCompare(b.empleadoNombre))
              .map((r, i) => (
                <div
                  key={`${d}-${i}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "8px 10px",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{r.empleadoNombre}</div>
                    <div className="sub">
                      {r.sucursalNombre} • historial: {r.obs} obs • {r.tardanzas} tardanzas
                    </div>
                  </div>
                  <span className="badge warn">{Math.round(r.prob * 100)}%</span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ====== Ganadores puntuales por sucursal ====== */
function WinnersList({ rows = [] }) {
  // ya viene 1 por sucursal; agrupamos por sucursal solo para orden
  const bySuc = rows.reduce((acc, r) => {
    (acc[r.sucursalNombre || "—"] ||= []).push(r);
    return acc;
  }, {});
  const sucs = Object.keys(bySuc).sort((a, b) => a.localeCompare(b));

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {sucs.map((suc) => {
        const r = bySuc[suc][0];
        return (
          <div key={suc} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>{suc}</strong>
              <span className="sub">
                {r.diasTrabajados} días analizados (ganador)
              </span>
            </div>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <div style={{ fontWeight: 900 }}>{r.empleadoNombre}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="chip chip-green">{r.pctPuntualidad}%</span>
                <span className="sub">({r.diasPuntuales}/{r.diasTrabajados} puntuales)</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== util: partir array en columnas ===== */
function chunk(arr = [], size = 3) {
  const out = [];
  for (let i = 0; i < arr.length; i += Math.ceil(arr.length / size)) {
    out.push(arr.slice(i, i + Math.ceil(arr.length / size)));
  }
  return out;
}
