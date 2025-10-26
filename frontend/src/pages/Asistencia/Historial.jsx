// frontend/src/pages/Asistencia/Historial.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs"

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* ============== Chips reutilizables y estado múltiple ============== */
function Chip({ text, style }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: 12,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </span>
  );
}

/** Muestra múltiples estados simultáneamente según minutosTarde / minutosTemprano. */
function MultiEstado({ estado, mt = 0, me = 0 }) {
  const st = String(estado || "INA").toUpperCase();
  const chips = [];

  // AUSENCIA (antes "INA")
  if (st === "INA") {
    chips.push(
      <Chip
        key="AUS"
        text="Ausente"
        style={{
          background: "rgba(100,116,139,.14)",
          border: "1px solid rgba(100,116,139,.35)",
          color: "#334155",
        }}
      />
    );
    return (
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {chips}
      </div>
    );
  }

  if (st === "INCOMPLETO") {
    chips.push(
      <Chip
        key="INC"
        text="INCOMPLETO"
        style={{
          background: "rgba(168,85,247,.12)",
          border: "1px solid rgba(168,85,247,.35)",
          color: "#6b21a8",
        }}
      />
    );
    return (
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {chips}
      </div>
    );
  }

  // Puntual cuando no hubo ni tarde ni temprano
  if ((mt || 0) <= 0 && (me || 0) <= 0) {
    chips.push(
      <Chip
        key="OK"
        text="PUNTUAL"
        style={{
          background: "rgba(16,185,129,.12)",
          border: "1px solid rgba(16,185,129,.35)",
          color: "#065f46",
        }}
      />
    );
  }

  if (mt > 0) {
    chips.push(
      <Chip
        key="T"
        text={`TARDE +${mt}m`}
        style={{
          background: "rgba(245,158,11,.14)",
          border: "1px solid rgba(245,158,11,.35)",
          color: "#92400e",
        }}
      />
    );
  }

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

  return (
    <div
      style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}
    >
      {chips}
    </div>
  );
}

/* ============================== Página ============================== */
export default function AsistenciaHistorial() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [sucursalId, setSucursalId] = useState("");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

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
    setLoading(true);
    setMsg("");
    try {
      const params = { from, to };
      if (sucursalId) params.sucursalId = Number(sucursalId);
      if (q.trim()) params.q = q.trim();

      const { data } = await axios.get(`${API_BASE}/asistencia/historial`, {
        params,
        headers,
      });
      const arr = Array.isArray(data) ? data : data.items || [];
      setRows(arr);
      if (arr.length === 0)
        setMsg("Sin resultados para el rango seleccionado.");
    } catch {
      setMsg("No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  // Búsqueda automática (debounce simple)
  useEffect(() => {
    const t = setTimeout(() => fetchRows(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, sucursalId, q]);

  // Helpers UI
  function fmtTime(ts) {
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleTimeString("es-GT", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  }

  /* ==================== Resumen (contado por minutos) ==================== */
  const total = rows.length;
  const puntuales = rows.filter(
    (r) =>
      (r.estado || "").toUpperCase() !== "INA" &&
      (r.estado || "").toUpperCase() !== "INCOMPLETO" &&
      Number(r.minutosTarde || 0) <= 0 &&
      Number(r.minutosTemprano || 0) <= 0
  ).length;
  const tardes = rows.filter((r) => Number(r.minutosTarde || 0) > 0).length;
  const tempranos = rows.filter((r) => Number(r.minutosTemprano || 0) > 0).length;
  const incompletos = rows.filter(
    (r) => (r.estado || "").toUpperCase() === "INCOMPLETO"
  ).length;
  const ausencias = rows.filter(
    (r) => (r.estado || "").toUpperCase() === "INA"
  ).length;

  /* ==================== EXPORT: helpers comunes ==================== */
  const filtrosTexto = () => {
    const suc = sucursales.find(s => String(s.id) === String(sucursalId));
    const sucTxt = suc ? `${suc.nombre} (ID ${suc.id})` : "Todas";
    const qTxt = q?.trim() ? q.trim() : "—";
    return {
      rango: `${from} → ${to}`,
      sucursal: sucTxt,
      busqueda: qTxt,
      generado: new Date().toLocaleString("es-GT")
    };
  };

  const buildDetalle = () =>
    rows.map((r) => ({
      Fecha: r.fecha || "-",
      Empleado: r.empleadoNombre || "-",
      Código: r.empleadoCodigo || "-",
      Entrada: fmtTime(r.entrada),
      Salida: fmtTime(r.salida),
      Estado:
        (r.estado || "").toUpperCase() === "INA"
          ? "AUSENTE"
          : (r.estado || "-"),
      "Min. Tarde": Number(r.minutosTarde || 0),
      "Min. Salida anticipada": Number(r.minutosTemprano || 0),
      Sucursal: r.sucursalNombre || "-",
    }));

  const buildResumen = () => ([
    { Métrica: "Total registros", Valor: total },
    { Métrica: "Puntuales", Valor: puntuales },
    { Métrica: "Tardes", Valor: tardes },
    { Métrica: "Salidas anticipadas", Valor: tempranos },
    { Métrica: "Incompletos", Valor: incompletos },
    { Métrica: "Ausencias", Valor: ausencias },
  ]);

  /* ==================== EXPORT: PDF ==================== */
  function exportPDF() {
    const det = buildDetalle();
    const info = filtrosTexto();

    const doc = new jsPDF("l", "pt", "a4"); // landscape
    const pageWidth = doc.internal.pageSize.getWidth();

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Historial de asistencia", pageWidth / 2, 40, { align: "center" });

    // Subtítulo / filtros
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const y0 = 65;
    doc.text(`Rango: ${info.rango}`, 40, y0);
    doc.text(`Sucursal: ${info.sucursal}`, 40, y0 + 16);
    doc.text(`Búsqueda: ${info.busqueda}`, 40, y0 + 32);
    doc.text(`Generado: ${info.generado}`, 40, y0 + 48);

    // Tabla (autoTable)
    const headers = [
      "Fecha",
      "Empleado",
      "Código",
      "Entrada",
      "Salida",
      "Estado",
      "Min. Tarde",
      "Min. Salida anticipada",
      "Sucursal",
    ];

    autoTable(doc, {
      startY: y0 + 70,
      head: [headers],
      body: det.map((r) => headers.map((h) => r[h])),
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 6, halign: "left", valign: "middle" },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      didDrawPage: (data) => {
        // Footer con numeración
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(
          `Página ${data.pageNumber} / ${pageCount}`,
          pageWidth - 80,
          doc.internal.pageSize.getHeight() - 10
        );
      },
      margin: { left: 30, right: 30 },
    });

    doc.save(`historial-asistencia_${from}_a_${to}.pdf`);
  }

  /* ==================== EXPORT: EXCEL ==================== */
async function exportExcel() {
  const info = filtrosTexto();
  const det = buildDetalle();
  const res = buildResumen();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Mundo Creativo Asistencia";
  wb.created = new Date();

  /* ===== Hoja Detalle ===== */
  const ws = wb.addWorksheet("Detalle", {
    views: [{ state: "frozen", ySplit: 7 }], // congela hasta la fila de encabezado
    properties: { defaultRowHeight: 18 },
  });

  // Columnas
  const columns = [
    { header: "Fecha", key: "Fecha", width: 12 },
    { header: "Empleado", key: "Empleado", width: 28 },
    { header: "Código", key: "Código", width: 12 },
    { header: "Entrada", key: "Entrada", width: 12 },
    { header: "Salida", key: "Salida", width: 12 },
    { header: "Estado", key: "Estado", width: 16 },
    { header: "Min. Tarde", key: "Min. Tarde", width: 12 },
    { header: "Min. Salida anticipada", key: "Min. Salida anticipada", width: 20 },
    { header: "Sucursal", key: "Sucursal", width: 26 },
  ];
  ws.columns = columns;

  // Título (A1:I1)
  const lastCol = String.fromCharCode("A".charCodeAt(0) + columns.length - 1); // 'I'
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell("A1").value = "Historial de asistencia";
  ws.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };

  // Bloque filtros
  ws.getCell("A3").value = "Rango";
  ws.getCell("B3").value = info.rango;
  ws.getCell("A4").value = "Sucursal";
  ws.getCell("B4").value = info.sucursal;
  ws.getCell("A5").value = "Búsqueda";
  ws.getCell("B5").value = info.busqueda;
  ws.getCell("A6").value = "Generado";
  ws.getCell("B6").value = info.generado;

  ["A3", "A4", "A5", "A6"].forEach((c) => {
    ws.getCell(c).font = { bold: true, color: { argb: "FF334155" } };
  });

  // Encabezado de tabla en fila 7
  const headerRow = ws.getRow(7);
  headerRow.values = columns.map((c) => c.header);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
  headerRow.height = 22;

  // Autofiltro en la fila 7
  ws.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: 7, column: columns.length },
  };

  // Cuerpo (desde fila 8) con zebra
  let r = 8;
  det.forEach((row) => {
    const excelRow = ws.addRow(row);
    excelRow.eachCell((cell) => {
      cell.alignment = { vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
    if (r % 2 === 0) {
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
    r++;
  });

  /* ===== Hoja Resumen ===== */
  const ws2 = wb.addWorksheet("Resumen", {
    properties: { defaultRowHeight: 20 },
  });

  ws2.mergeCells("A1:C1");
  ws2.getCell("A1").value = "Resumen de asistencia";
  ws2.getCell("A1").alignment = { horizontal: "center" };
  ws2.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  ws2.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0EA5E9" } };

  ws2.getCell("A3").value = "Rango";
  ws2.getCell("B3").value = info.rango;
  ws2.getCell("A4").value = "Sucursal";
  ws2.getCell("B4").value = info.sucursal;
  ws2.getCell("A5").value = "Búsqueda";
  ws2.getCell("B5").value = info.busqueda;
  ws2.getCell("A6").value = "Generado";
  ws2.getCell("B6").value = info.generado;

  ["A3", "A4", "A5", "A6"].forEach((c) => {
    ws2.getCell(c).font = { bold: true, color: { argb: "FF334155" } };
  });

  ws2.addRow([]);
  ws2.addRow(["Métrica", "Valor"]);
  const headerRes = ws2.lastRow;
  headerRes.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRes.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
  res.forEach((x) => ws2.addRow([x.Métrica, x.Valor]));
  ws2.columns = [{ width: 28 }, { width: 16 }, { width: 8 }];

  // Descargar
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `historial-asistencia_${from}_a_${to}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}


  return (
    <div style={{ paddingRight: 8 }}>
      <div
        className="card"
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 14,
          background: "#fff",
          marginBottom: 12,
        }}
      >
        <div
          className="row-between"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Historial de asistencia</h2>

          {/* Resumen */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span className="chip-stat">Total: {total}</span>
            <span className="chip-stat">Puntual: {puntuales}</span>
            <span className="chip-stat chip-warn">Tarde: {tardes}</span>
            <span className="chip-stat chip-info">Temprano: {tempranos}</span>
            <span className="chip-stat chip-violet">
              Incompleto: {incompletos}
            </span>
            <span className="chip-stat chip-muted">
              Ausente: {ausencias}
            </span>
          </div>
        </div>

        {/* Filtros */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <div className="field">
            <label>Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Sucursal</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
            >
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 240 }}>
            <label>Buscar</label>
            <input
              placeholder="Nombre, código o ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={exportPDF} className="btn-chip btn-red">📄 PDF</button>
            <button onClick={exportExcel} className="btn-chip btn-green">📊 Excel</button>
            <button
              onClick={() => {
                setFrom(
                  new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
                );
                setTo(new Date().toISOString().slice(0, 10));
                setSucursalId("");
                setQ("");
                setRows([]);
                setMsg("");
              }}
              className="btn-chip btn-slate"
            >
              Limpiar
            </button>
          </div>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 10,
              color: /Sin resultados/.test(msg) ? "#334155" : "#991b1b",
              background: /Sin resultados/.test(msg)
                ? "rgba(100,116,139,.10)"
                : "rgba(239,68,68,.10)",
              border: `1px solid ${
                /Sin resultados/.test(msg)
                  ? "rgba(100,116,139,.35)"
                  : "rgba(239,68,68,.35)"
              }`,
            }}
          >
            {msg}
          </div>
        )}
      </div>

      {/* Tabla */}
      <div style={{ overflowX: "auto" }}>
        <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">Fecha</th>
              <th align="left">Empleado</th>
              <th align="center">Entrada</th>
              <th align="center">Salida</th>
              <th align="center">Estado</th>
              <th align="left">Sucursal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ whiteSpace: "nowrap" }}>{r.fecha || "-"}</td>
                <td>
                  <div style={{ fontWeight: 800 }}>{r.empleadoNombre}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    ({r.empleadoCodigo})
                  </div>
                </td>
                <td align="center" style={{ whiteSpace: "nowrap" }}>
                  {r.entrada
                    ? new Date(r.entrada).toLocaleTimeString("es-GT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </td>
                <td align="center" style={{ whiteSpace: "nowrap" }}>
                  {r.salida
                    ? new Date(r.salida).toLocaleTimeString("es-GT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
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
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: 20, textAlign: "center", color: "#64748b" }}
                >
                  {msg || "Sin resultados"}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  style={{ padding: 20, textAlign: "center", color: "#64748b" }}
                >
                  Cargando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* estilos compartidos (chips/inputs/botones) */}
      <style>{`
        .chip-stat{
          padding:6px 10px; border-radius:999px; font-weight:800; font-size:12px;
          background:rgba(99,102,241,.10); border:1px solid rgba(99,102,241,.35); color:#3730a3;
        }
        .chip-warn{
          background:rgba(245,158,11,.12); border-color:rgba(245,158,11,.35); color:#92400e;
        }
        .chip-info{
          background:rgba(59,130,246,.12); border-color:rgba(59,130,246,.35); color:#1d4ed8;
        }
        .chip-muted{
          background:rgba(100,116,139,.12); border-color:rgba(100,116,139,.35); color:#334155;
        }
        .chip-violet{
          background:rgba(168,85,247,.12); border-color:rgba(168,85,247,.35); color:#6b21a8;
        }

        .field{ display:flex; flex-direction:column; gap:6px; }
        .field > label{ font-size:12px; color:#475569; font-weight:700; }
        .field > input, .field > select{
          padding:10px; border-radius:10px; border:1px solid #e5e7eb; min-width:180px;
          outline:none;
        }

        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:10px 14px;font-weight:800;
          box-shadow:0 4px 14px rgba(2,6,23,.12); cursor:pointer; transition:filter .12s, transform .05s;
          display:inline-flex; align-items:center; justify-content:center; height:38px; line-height:1; white-space:nowrap;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-slate{ background:#475569; color:#fff; }
        .btn-red{ background:linear-gradient(135deg,#ef4444,#b91c1c); color:#fff; }
        .btn-green{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff; }
      `}</style>
    </div>
  );
}
