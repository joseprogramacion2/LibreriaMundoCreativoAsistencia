import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* ================= Helpers (zona horaria GT) ================= */
function fmtTimeUTC(utcStr) {
  if (!utcStr) return "-";
  return new Date(utcStr).toLocaleTimeString("es-GT", {
    timeZone: "America/Guatemala",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function niceNowGT() {
  return new Date().toLocaleDateString("es-GT", {
    timeZone: "America/Guatemala",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* Debounce util */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ======= Chips de estado (puede mostrar múltiples simultáneamente) ======= */
function Chip({ text, style }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

function MultiEstado({ estado, mt = 0, me = 0 }) {
  const chips = [];

  // Ausente
  if (!estado || estado === "INA") {
    chips.push(
      <Chip
        key="aus"
        text="Ausente"
        style={{
          background: "rgba(100,116,139,.12)",
          border: "1px solid rgba(100,116,139,.35)",
          color: "#334155",
        }}
      />
    );
    return <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>{chips}</div>;
  }

  // Incompleto
  if (estado === "INCOMPLETO") {
    chips.push(
      <Chip
        key="inc"
        text="Incompleto"
        style={{
          background: "rgba(139,92,246,.12)",
          border: "1px solid rgba(139,92,246,.35)",
          color: "#5b21b6",
        }}
      />
    );
    return <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>{chips}</div>;
  }

  // Puntual si no hubo ninguno de los dos
  if ((mt || 0) <= 0 && (me || 0) <= 0) {
    chips.push(
      <Chip
        key="ok"
        text="Puntual"
        style={{
          background: "rgba(16,185,129,.12)",
          border: "1px solid rgba(16,185,129,.35)",
          color: "#065f46",
        }}
      />
    );
  }

  // Tarde
  if (mt > 0) {
    chips.push(
      <Chip
        key="late"
        text={`Tarde +${mt}m`}
        style={{
          background: "rgba(245,158,11,.12)",
          border: "1px solid rgba(245,158,11,.35)",
          color: "#92400e",
        }}
      />
    );
  }

  // Salida anticipada (nombre uniforme)
  if (me > 0) {
    chips.push(
      <Chip
        key="early"
        text={`Salida anticipada -${me}m`}
        style={{
          background: "rgba(59,130,246,.10)",
          border: "1px solid rgba(59,130,246,.30)",
          color: "#1d4ed8",
        }}
      />
    );
  }

  return <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>{chips}</div>;
}

export default function AsistenciaDiaria() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [sucursalId, setSucursalId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoyNice, setHoyNice] = useState(niceNowGT());

  // refs para polling
  const pollingRef = useRef(null);
  const isFetchingRef = useRef(false);
  const debouncedFetchRef = useRef(null);

  // Refresca el texto de fecha automáticamente cada minuto
  useEffect(() => {
    const t = setInterval(() => setHoyNice(niceNowGT()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Carga de sucursales
  useEffect(() => {
    axios
      .get(`${API_BASE}/sucursales`, { headers })
      .then(({ data }) =>
        setSucursales(Array.isArray(data) ? data : data.items || [])
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchRows() {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading((prev) => prev || rows.length === 0);
    try {
      const params = {};
      if (sucursalId) params.sucursalId = Number(sucursalId);
      if (q.trim()) params.q = q.trim();

      const { data } = await axios.get(`${API_BASE}/asistencia/diaria`, {
        params,
        headers,
      });
      setRows(Array.isArray(data) ? data : data.items || []);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }

  // Carga inicial
  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch con debounce al cambiar filtros
  useEffect(() => {
    const t = setTimeout(fetchRows, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, q]);

  /* ===================== Polling inteligente ===================== */
  useEffect(() => {
    debouncedFetchRef.current = debounce(() => {
      if (document.visibilityState === "visible") {
        fetchRows();
      }
    }, 250);

    function startPolling() {
      if (pollingRef.current) return;
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          debouncedFetchRef.current?.();
        }
      }, 2000);
    }

    function stopPolling() {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    if (document.visibilityState === "visible") {
      startPolling();
    }

    const onVis = () => {
      if (document.visibilityState === "visible") {
        startPolling();
        fetchRows();
      } else {
        stopPolling();
      }
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        fetchRows();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, q, token]);

  return (
    <div style={{ paddingRight: 8 }}>
      {/* Cabecera */}
      <div
        className="page-head row-between"
        style={{ marginBottom: 12, display: "flex", alignItems: "center" }}
      >
        <h2 style={{ margin: 0 }}>Asistencia diaria</h2>
        <div
          className="btn-chip btn-slate"
          aria-label="Fecha de hoy"
          title="Solo se muestra el día de hoy"
        >
          📅 {hoyNice}
        </div>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          margin: "12px 0",
        }}
      >
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>

        <input
          placeholder="Filtrar por nombre, código o ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            minWidth: 260,
          }}
        />
      </div>

      {/* Tabla */}
      <div style={{ overflowX: "auto" }}>
        <table width="100%" cellPadding="10" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">Empleado</th>
              <th align="center">Entrada</th>
              <th align="center">Salida</th>
              <th align="center">Estado</th>
              <th align="left">Sucursal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.empleadoId} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td>
                  <div style={{ fontWeight: 800 }}>{r.empleadoNombre}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    ({r.empleadoCodigo})
                  </div>
                </td>
                <td align="center" style={{ whiteSpace: "nowrap" }}>
                  {fmtTimeUTC(r.entrada)}
                </td>
                <td align="center" style={{ whiteSpace: "nowrap" }}>
                  {fmtTimeUTC(r.salida)}
                </td>
                <td align="center">
                  <MultiEstado
                    estado={r.estado}
                    mt={Number(r.minutosTarde || 0)}
                    me={Number(r.minutosTemprano || 0)}
                  />
                </td>
                <td>{r.sucursalNombre || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ padding: 20, textAlign: "center", color: "#64748b" }}
                >
                  {loading ? "Cargando…" : "Sin datos para hoy"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* estilos compartidos */}
      <style>{`
        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:700;
          box-shadow:0 4px 14px rgba(2,6,23,.12); cursor:pointer; transition:filter .12s, transform .05s;
          display:inline-flex; align-items:center; justify-content:center; height:38px; line-height:1; white-space:nowrap;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-blue{ background:linear-gradient(135deg,#3b82f6,#06b6d4); color:#fff; }
        .btn-slate{ background:#475569; color:#fff; }
      `}</style>
    </div>
  );
}
