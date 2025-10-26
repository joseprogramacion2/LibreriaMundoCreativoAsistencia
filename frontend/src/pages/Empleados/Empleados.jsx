// frontend/src/pages/Empleados.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* ==== Helpers generales ==== */
function digitsOnly(s = "") {
  return String(s).replace(/\D/g, "");
}
function maskDPI(value = "") {
  const d = digitsOnly(value).slice(0, 13);
  const a = d.slice(0, 4);
  const b = d.slice(4, 9);
  const c = d.slice(9, 13);
  return [a, b, c].filter(Boolean).join(" ");
}
function unmaskDPI(masked = "") {
  return digitsOnly(masked);
}
function norm(s = "") {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ==== Helpers AM/PM <-> 24h ==== */
function to24h(hhmm12 = "") {
  const m = String(hhmm12).trim().match(/^(\d{1,2}):(\d{2})\s*([APap][Mm])$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = m[3].toUpperCase();

  if (h < 1 || h > 12) return null;
  if (ampm === "AM") {
    h = h % 12; // 12 AM => 0
  } else {
    h = (h % 12) + 12; // 12 PM => 12
  }
  return `${String(h).padStart(2, "0")}:${mm}`;
}

function to12h(hhmm24 = "") {
  const [hStr, mStr] = String(hhmm24 || "").split(":");
  if (hStr == null || mStr == null) return "";
  let h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(mStr).padStart(2, "0")} ${ampm}`;
}

/* ==== Picker de hora en 12h (AM/PM) ==== */
function TimeInput12({ value, onChange }) {
  const FALLBACK = "08:00 AM";

  function parse12(v = "") {
    const str = String(v || "").trim();
    const m = str.match(/^(\d{1,2}):(\d{2})\s*([APap][Mm])$/);
    if (!m) return { h: "08", m: "00", ampm: "AM" };
    let hh = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const ap = m[3].toUpperCase() === "AM" ? "AM" : "PM";
    const hNum = Math.min(12, Math.max(1, parseInt(hh, 10)));
    hh = String(hNum).padStart(2, "0");
    return { h: hh, m: mm, ampm: ap };
  }

  const init = parse12(value || FALLBACK);
  const [h, setH] = useState(init.h);
  const [m, setM] = useState(init.m);
  const [ampm, setAmpm] = useState(init.ampm);

  useEffect(() => {
    const p = parse12(value || FALLBACK);
    setH(p.h);
    setM(p.m);
    setAmpm(p.ampm);
  }, [value]);

  useEffect(() => {
    onChange?.(`${h}:${m} ${ampm}`);
  }, [h, m, ampm]); // eslint-disable-line

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select value={h} onChange={(e) => setH(e.target.value)}
        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
        {hours.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span>:</span>
      <select value={m} onChange={(e) => setM(e.target.value)}
        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
        {minutes.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select value={ampm} onChange={(e) => setAmpm(e.target.value)}
        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
        <option>AM</option>
        <option>PM</option>
      </select>
    </div>
  );
}

/* ==== API helpers ==== */
async function apiCambiarSueldo(empleadoId, salarioMensual) {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const { data } = await axios.put(
    `${API_BASE}/empleados/${empleadoId}/salario`,
    { salarioMensual: Number(salarioMensual || 0) },
    { headers }
  );
  return data;
}

export default function Empleados() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [rows, setRows] = useState([]);
  const [sucursales, setSucursales] = useState([]);

  // Turnos
  const [turnosActivos, setTurnosActivos] = useState([]); // para combo empleado
  const [turnosAll, setTurnosAll] = useState([]);         // para gestión (lista completa)

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroSucursal, setFiltroSucursal] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  // Modal Empleado
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editingId, setEditingId] = useState(null);

  // Confirm estado
  const [confirmData, setConfirmData] = useState(null);

  // Mensajes/estados
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    dpi: "",
    nombre: "",
    apellido: "",
    sucursalId: "",
    activo: true,
    turnoId: "",          // obligatorio
    userIdDispositivo: "",
    salarioMensual: "",   // string para input
    horasMetaRef: "160",  // editable; se usa en nómina si >0
  });

  /* =================== Turnos Modal =================== */
  const [showTurnos, setShowTurnos] = useState(false);
  const [turnoForm, setTurnoForm] = useState({
    nombre: "",
    horaEntrada: "08:00 AM",
    horaSalida: "05:00 PM",
    toleranciaMinutos: 5,
    activo: true,
  });
  const [turnoMsg, setTurnoMsg] = useState("");

  const [turnoSaving, setTurnoSaving] = useState(false);
  const [turnoEditId, setTurnoEditId] = useState(null);

  // Bloquear scroll cuando hay modal
  useEffect(() => {
    const anyModal = showModal || showTurnos || !!confirmData;
    document.body.style.overflow = anyModal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showModal, showTurnos, confirmData]);

  // ESC para cerrar turnos
  useEffect(() => {
    if (!showTurnos) return;
    const onKey = (e) => { if (e.key === "Escape") cerrarTurnos(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showTurnos, turnoSaving]); // eslint-disable-line

  function resetForm() {
    setForm({
      dpi: "",
      nombre: "",
      apellido: "",
      sucursalId: "",
      activo: true,
      turnoId: "",
      userIdDispositivo: "",
      salarioMensual: "",
      horasMetaRef: "160",
    });
  }

  function onFormChange(e) {
    const { name, value, type, checked } = e.target;
    if (name === "dpi") return setForm((f) => ({ ...f, dpi: maskDPI(value) }));
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  async function fetchTurnosActivos() {
    const { data } = await axios.get(`${API_BASE}/turnos`, { headers, params: { onlyActivos: 1 } });
    setTurnosActivos(Array.isArray(data) ? data : data.items || []);
  }
  async function fetchTurnosAll() {
    const { data } = await axios.get(`${API_BASE}/turnos`, { headers });
    setTurnosAll(Array.isArray(data) ? data : data.items || []);
  }
  async function fetchBaseData() {
    setLoading(true);
    try {
      const [suc] = await Promise.all([
        axios.get(`${API_BASE}/sucursales`, { headers }),
      ]);
      setSucursales(Array.isArray(suc.data) ? suc.data : suc.data.items || []);
      await Promise.all([fetchTurnosActivos(), fetchTurnosAll()]);
    } finally {
      setLoading(false);
    }
  }
  async function fetchEmpleados() {
    setLoading(true);
    try {
      const params = {};
      if (filtroTexto) params.q = filtroTexto;
      if (filtroSucursal) params.sucursalId = filtroSucursal;
      const { data } = await axios.get(`${API_BASE}/empleados`, { params, headers });
      const arr = Array.isArray(data) ? data : data.items || [];
      setRows(arr);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBaseData();
    fetchEmpleados();
  }, []); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => fetchEmpleados(), 250);
    return () => clearTimeout(t);
  }, [filtroTexto, filtroSucursal]); // eslint-disable-line

  // Filtro local
  const rowsFiltrados = useMemo(() => {
    let list = rows;
    if (filtroEstado === "activos") list = list.filter((r) => !!r.activo);
    if (filtroEstado === "inactivos") list = list.filter((r) => !r.activo);
    if (filtroSucursal) list = list.filter((r) => String(r.sucursalId) === String(filtroSucursal));

    const q = filtroTexto.trim();
    if (q) {
      const qNorm = norm(q);
      const qDigits = digitsOnly(q);
      list = list.filter((r) => {
        const nombreCompleto = `${r.nombre || ""} ${r.apellido || ""}`;
        const nomNorm = norm(nombreCompleto);
        const codigoNorm = norm(r.codigo || "");
        const dpiStr = String(r.dpi || "");
        const dpiDigits = digitsOnly(dpiStr);
        const dpiMaskedNorm = norm(maskDPI(dpiStr));
        return (
          nomNorm.includes(qNorm) ||
          codigoNorm.includes(qNorm) ||
          dpiMaskedNorm.includes(qNorm) ||
          (!!qDigits && dpiDigits.includes(qDigits))
        );
      });
    }
    return list;
  }, [rows, filtroEstado, filtroSucursal, filtroTexto]);

  function abrirCrear() {
    setModalMode("create");
    setEditingId(null);
    resetForm();
    setMsg("");
    setShowModal(true);
  }

  function abrirEditar(r) {
    setModalMode("edit");
    setEditingId(r.id);
    setMsg("");

    const currentTurnoId =
      r?.turnos?.[0]?.turno?.id ??
      r?.turnos?.[0]?.turnoId ??
      "";

    setForm({
      dpi: maskDPI(r.dpi || ""),
      nombre: r.nombre || "",
      apellido: r.apellido || "",
      sucursalId: String(r.sucursalId || ""),
      activo: !!r.activo,
      turnoId: currentTurnoId ? String(currentTurnoId) : "",
      userIdDispositivo: r.userIdDispositivo ?? "",
      salarioMensual: r.salarioMensual != null ? String(r.salarioMensual) : "",
      horasMetaRef: r.horasMetaRef != null && r.horasMetaRef !== ""
        ? String(r.horasMetaRef)
        : "160",
    });

    setShowModal(true);
  }

  function cerrarModal() {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setMsg("");
  }

  // ===== ¿userId tomado en esta sucursal? (para UX y bloqueo) =====
  const userIdTomado = useMemo(() => {
    const uidStr = String(form.userIdDispositivo ?? "").trim();
    const suc = String(form.sucursalId ?? "").trim();
    if (!uidStr || !suc) return false;
    const uid = Number(uidStr);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    return rows.some(r =>
      String(r.sucursalId) === suc &&
      Number(r.userIdDispositivo) === uid &&
      Number(r.id) !== Number(editingId || 0)
    );
  }, [form.userIdDispositivo, form.sucursalId, rows, editingId]);

  async function guardarEmpleado(e) {
    e.preventDefault();
    setMsg("");

    const dpiDigits = unmaskDPI(form.dpi);
    if (dpiDigits.length !== 13)
      return setMsg("DPI inválido. Debe tener 13 dígitos (formato 4-5-4).");
    if (!form.nombre.trim() || !form.apellido.trim() || !form.sucursalId)
      return setMsg("Completa DPI, nombre, apellido y sucursal.");
    if (!form.turnoId)
      return setMsg("Selecciona un turno.");

    // Validación previa: único por sucursal
    const uidStr = String(form.userIdDispositivo ?? "").trim();
    if (uidStr) {
      const uid = Number(uidStr);
      if (!Number.isFinite(uid) || uid <= 0) {
        return setMsg("UserID en el reloj debe ser un número positivo.");
      }
      const duplicado = rows.some(r =>
        String(r.sucursalId) === String(form.sucursalId) &&
        Number(r.userIdDispositivo) === uid &&
        Number(r.id) !== Number(editingId || 0)
      );
      if (duplicado) {
        return setMsg("❌ Ya existe un empleado con ese UserID en esta sucursal. Debe ser único por sucursal.");
      }
    }

    const payload = {
      dpi: dpiDigits,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      sucursalId: Number(form.sucursalId),
      activo: !!form.activo,
      userIdDispositivo:
        form.userIdDispositivo === "" ? null : Number(form.userIdDispositivo),
      turnoId: Number(form.turnoId),
    };

    // si viene una meta válida, inclúyela
    const hm = Number(form.horasMetaRef);
    if (Number.isFinite(hm) && hm > 0) {
      payload.horasMetaRef = hm;
    }

    setSaving(true);
    try {
      let saved;
      if (modalMode === "edit" && editingId) {
        await axios.put(`${API_BASE}/empleados/${editingId}`, payload, { headers });
        saved = { data: { id: editingId } };
        setMsg("✅ Empleado actualizado");
      } else {
        const resp = await axios.post(`${API_BASE}/empleados`, payload, { headers });
        saved = resp; // resp.data.id
        setMsg("✅ Empleado creado");
      }

      // sueldo por endpoint dedicado (si llenaron el campo)
      if (String(form.salarioMensual).trim() !== "") {
        await axios.put(
          `${API_BASE}/empleados/${saved.data.id}/salario`,
          { salarioMensual: Number(form.salarioMensual) },
          { headers }
        );
      }

      await fetchEmpleados();
      setTimeout(() => cerrarModal(), 300);
    } catch (err) {
      const m = err?.response?.data?.message || err?.response?.data?.error || "Error al guardar.";
      setMsg(`❌ ${m}`);
    } finally {
      setSaving(false);
    }
  }

  // ========= Confirmación estado (activar/desactivar) =========
  function pedirConfirmacionEstado(r) {
    setConfirmData({ row: r, nuevoEstado: !r.activo, error: "" });
  }

  async function confirmarEstado() {
    if (!confirmData) return;
    const { row, nuevoEstado } = confirmData;
    try {
      await axios.put(
        `${API_BASE}/empleados/${row.id}`,
        {
          activo: nuevoEstado,
          userIdDispositivo:
            row.userIdDispositivo === undefined ? null : row.userIdDispositivo,
        },
        { headers }
      );
      setConfirmData(null);
      await fetchEmpleados();
    } catch (e) {
      const m =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "No se pudo cambiar el estado.";
      setConfirmData((prev) => ({ ...(prev || {}), error: m }));
    }
  }

  /* =================== Turnos: UI & acciones =================== */
  function abrirTurnos() {
    setTurnoMsg("");
    setTurnoSaving(false);
    setTurnoEditId(null);
    setTurnoForm({
      nombre: "",
      horaEntrada: "08:00 AM",
      horaSalida: "05:00 PM",
      toleranciaMinutos: 5,
      activo: true,
    });
    setShowTurnos(true);
    fetchTurnosAll();
    fetchTurnosActivos();
  }
  function cerrarTurnos() {
    if (turnoSaving) return;
    setShowTurnos(false);
  }
  function onTurnoFormChange(e) {
    const { name, value, type, checked } = e.target;
    setTurnoForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }
  function editarTurno(t) {
    setTurnoEditId(t.id);
    setTurnoMsg("");
    setTurnoForm({
      nombre: t.nombre || "",
      horaEntrada: to12h(t.horaEntrada || "08:00"),
      horaSalida: to12h(t.horaSalida || "17:00"),
      toleranciaMinutos: Number(t.toleranciaMinutos || 5),
      activo: !!t.activo,
    });
  }

  function toMin(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  async function guardarTurno(e) {
    e.preventDefault();
    setTurnoMsg("");
    const { nombre, horaEntrada, horaSalida, toleranciaMinutos, activo } = turnoForm;

    if (!String(nombre).trim()) return setTurnoMsg("El nombre es obligatorio.");

    const ent24 = to24h(horaEntrada);
    const sal24 = to24h(horaSalida);
    if (!ent24 || !sal24) return setTurnoMsg("Horas en formato 12h, ej: 08:00 AM / 05:00 PM.");

    if (toMin(sal24) <= toMin(ent24))
      return setTurnoMsg("La hora de salida debe ser mayor que la de entrada.");

    setTurnoSaving(true);
    try {
      if (turnoEditId) {
        await axios.put(
          `${API_BASE}/turnos/${turnoEditId}`,
          { nombre, horaEntrada: ent24, horaSalida: sal24, toleranciaMinutos: Number(toleranciaMinutos), activo: !!activo },
          { headers }
        );
        setTurnoMsg("✅ Turno actualizado");
      } else {
        await axios.post(
          `${API_BASE}/turnos`,
          { nombre, horaEntrada: ent24, horaSalida: sal24, toleranciaMinutos: Number(toleranciaMinutos), activo: !!activo },
          { headers }
        );
        setTurnoMsg("✅ Turno creado");
      }
      await Promise.all([fetchTurnosAll(), fetchTurnosActivos()]);
      if (!turnoEditId) {
        setTurnoForm({
          nombre: "",
          horaEntrada: "08:00 AM",
          horaSalida: "05:00 PM",
          toleranciaMinutos: 5,
          activo: true,
        });
      }
    } catch (err) {
      const m = err?.response?.data?.message || "Error al guardar turno.";
      setTurnoMsg(`❌ ${m}`);
    } finally {
      setTurnoSaving(false);
    }
  }

  async function alternarActivoTurno(t) {
    try {
      await axios.put(`${API_BASE}/turnos/${t.id}`, { activo: !t.activo }, { headers });
      await Promise.all([fetchTurnosAll(), fetchTurnosActivos()]);
    } catch (e) {
      const m = e?.response?.data?.message || "No se pudo cambiar el estado del turno.";
      setTurnoMsg(`❌ ${m}`);
    }
  }

  // ===== Opciones de turno para el combo del empleado =====
  const opcionesTurno = useMemo(() => {
    const base = [...turnosActivos];
    const curId = Number(form.turnoId || 0);
    if (modalMode === "edit" && curId && !base.some(t => Number(t.id) === curId)) {
      const t = turnosAll.find(x => Number(x.id) === curId);
      if (t) base.unshift({ ...t, _inactive: true });
    }
    return base;
  }, [turnosActivos, turnosAll, modalMode, form.turnoId]);

  return (
    <div style={{ paddingRight: 8 }}>
      {/* Barra de acciones + filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <button onClick={abrirCrear} className="btn-chip btn-emerald">➕ Agregar empleado</button>
        <button onClick={abrirTurnos} className="btn-chip btn-indigo">🕒 Turnos</button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar por nombre, código o DPI"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", minWidth: 220 }}
          />
          <select
            value={filtroSucursal}
            onChange={(e) => setFiltroSucursal(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Tabla empleados */}
      <div style={{ overflowX: "auto" }}>
        <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">Código</th>
              <th align="left">DPI</th>
              <th align="left">Nombre</th>
              <th align="left">Sucursal</th>
              <th align="left">Turno</th>
              <th align="right">Sueldo (Q)</th>
              <th>UserID</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rowsFiltrados.map((r) => {
              const dpiMasked = maskDPI(r.dpi || "");
              const badge = r.activo
                ? { text: "Activo", bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", color: "#065f46" }
                : { text: "Inactivo", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.35)", color: "#991b1b" };
              const turnoActual = r.turnos?.[0]?.turno?.nombre || "-";
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td>{r.codigo}</td>
                  <td>{dpiMasked || "-"}</td>
                  <td>{r.nombre} {r.apellido}</td>
                  <td>{r.sucursal?.nombre || "-"}</td>
                  <td>{turnoActual}</td>
                  <td align="right">Q {Number(r.salarioMensual || 0).toFixed(2)}</td>
                  <td align="center">{r.userIdDispositivo ?? "-"}</td>
                  <td align="center">
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 12,
                        background: badge.bg,
                        border: `1px solid ${badge.bd}`,
                        color: badge.color,
                      }}
                    >
                      {badge.text}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn-chip btn-indigo" onClick={() => abrirEditar(r)}>Editar</button>
                      {r.activo ? (
                        <button className="btn-chip btn-danger" onClick={() => pedirConfirmacionEstado(r)}>Desactivar</button>
                      ) : (
                        <button className="btn-chip btn-emerald" onClick={() => pedirConfirmacionEstado(r)}>Activar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rowsFiltrados.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                  {loading ? "Cargando…" : "Sin empleados"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL Crear/Editar Empleado */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.6)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ width: "min(820px, 92vw)", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
            <div
              style={{ padding: 14, background: "linear-gradient(90deg,#3b82f6,#10b981)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <div style={{ fontWeight: 800 }}>{modalMode === "edit" ? "Editar empleado" : "Nuevo empleado"}</div>
              <button onClick={cerrarModal} style={{ background: "transparent", color: "#fff", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {msg && (
              <div
                style={{
                  margin: 12, padding: 10, borderRadius: 10,
                  color: /✅/.test(msg) ? "#065f46" : "#991b1b",
                  background: /✅/.test(msg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
                  border: `1px solid ${/✅/.test(msg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"}`
                }}
              >
                {msg}
              </div>
            )}

            <form onSubmit={guardarEmpleado} style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>DPI</div>
                  <input
                    name="dpi"
                    placeholder="#### ##### ####"
                    value={form.dpi}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>UserID en el reloj</div>
                  <input
                    name="userIdDispositivo"
                    type="number"
                    placeholder="ej. 1"
                    value={form.userIdDispositivo}
                    onChange={onFormChange}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: `1px solid ${userIdTomado ? '#ef4444' : '#e5e7eb'}`,
                      width: "100%"
                    }}
                  />
                  {userIdTomado && (
                    <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                      Ya existe un empleado con ese UserID en esta sucursal.
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Nombre *</div>
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Apellido *</div>
                  <input
                    name="apellido"
                    value={form.apellido}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Sucursal *</div>
                  <select
                    name="sucursalId"
                    value={form.sucursalId}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Selecciona…</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Turno *</div>
                  <select
                    name="turnoId"
                    value={form.turnoId}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  >
                    <option value="">Selecciona…</option>
                    {opcionesTurno.map((t) => (
                      <option key={t.id} value={t.id} disabled={t._inactive}>
                        {t._inactive ? "[INACTIVO] " : ""}{t.nombre} ({to12h(t.horaEntrada)}–{to12h(t.horaSalida)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* NUEVOS CAMPOS: sueldo y horas */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>
                    Sueldo mensual (Q)
                  </div>
                  <input
                    name="salarioMensual"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="p. ej. 3000.00"
                    value={form.salarioMensual}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  />
                </div>
                <div title="Esta meta de horas se usará para calcular tu nómina (si es > 0). Si no pones nada, se usa la meta del período.">
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>
                    Horas meta para ese sueldo
                  </div>
                  <input
                    name="horasMetaRef"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="160"
                    value={form.horasMetaRef}
                    onChange={onFormChange}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                  />
                </div>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="activo" checked={form.activo} onChange={onFormChange} /> Activo
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 6 }}>
                <button type="button" onClick={cerrarModal} className="btn-chip btn-slate">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-chip btn-emerald" style={{ minWidth: 180 }}>
                  {saving ? "Guardando…" : modalMode === "edit" ? "Guardar cambios" : "Crear empleado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL Confirmación estado */}
      {confirmData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.6)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ width: "min(520px, 92vw)", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,.12)", display: "grid", placeItems: "center", color: "#1d4ed8", fontWeight: 800 }}>!</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Confirmar acción</div>
                <div style={{ color: "#475569" }}>
                  ¿Seguro que deseas {confirmData.nuevoEstado ? "activar" : "desactivar"} a{" "}
                  <strong>{confirmData.row?.nombre} {confirmData.row?.apellido}</strong>?
                </div>
              </div>
            </div>

            {confirmData?.error && (
              <div
                style={{
                  margin: 12, padding: 10, borderRadius: 10,
                  color: "#991b1b",
                  background: "rgba(239,68,68,.10)",
                  border: "1px solid rgba(239,68,68,.35)"
                }}
              >
                ❌ {confirmData.error}
              </div>
            )}

            <div style={{ padding: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmData(null)} className="btn-chip btn-slate">Cancelar</button>
              {confirmData.nuevoEstado ? (
                <button onClick={confirmarEstado} className="btn-chip btn-emerald">Activar</button>
              ) : (
                <button onClick={confirmarEstado} className="btn-chip btn-danger">Desactivar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL Turnos */}
      {showTurnos && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) cerrarTurnos(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.6)", display: "grid", placeItems: "center", zIndex: 60 }}
        >
          <div
            style={{
              width: "min(980px, 94vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header sticky */}
            <div
              style={{
                padding: 14,
                background: "linear-gradient(90deg,#7c3aed,#10b981)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <div style={{ fontWeight: 800 }}>Gestión de turnos</div>
              <button onClick={cerrarTurnos} style={{ background: "transparent", color: "#fff", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
            </div>

            {turnoMsg && (
              <div
                style={{
                  margin: 12, padding: 10, borderRadius: 10,
                  color: /✅/.test(turnoMsg) ? "#065f46" : "#991b1b",
                  background: /✅/.test(turnoMsg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
                  border: `1px solid ${/✅/.test(turnoMsg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"}`
                }}
              >
                {turnoMsg}
              </div>
            )}

            {/* Área scrolleable */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ display: "grid", gap: 16, padding: 16 }}>
                {/* Form crear/editar turno con AM/PM */}
                <form onSubmit={guardarTurno} style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Nombre</div>
                      <input
                        name="nombre"
                        placeholder="p. ej. Mañana"
                        value={turnoForm.nombre}
                        onChange={onTurnoFormChange}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Entrada</div>
                      <TimeInput12
                        key={`ent-${turnoEditId ?? 'new'}`}
                        value={turnoForm.horaEntrada}
                        onChange={(v) => setTurnoForm(f => ({ ...f, horaEntrada: v }))}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Salida</div>
                      <TimeInput12
                        key={`sal-${turnoEditId ?? 'new'}`}
                        value={turnoForm.horaSalida}
                        onChange={(v) => setTurnoForm(f => ({ ...f, horaSalida: v }))}
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#334155" }}>Tolerancia (min)</div>
                      <input
                        type="number"
                        min={0}
                        name="toleranciaMinutos"
                        value={turnoForm.toleranciaMinutos}
                        onChange={onTurnoFormChange}
                        placeholder="min"
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", width: "100%" }}
                      />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                      <input type="checkbox" name="activo" checked={turnoForm.activo} onChange={onTurnoFormChange} />
                      Activo
                    </label>
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn-chip btn-slate"
                      onClick={() => { setTurnoEditId(null); setTurnoForm({ nombre:"", horaEntrada:"08:00 AM", horaSalida:"05:00 PM", toleranciaMinutos:5, activo:true }); setTurnoMsg(""); }}
                    >
                      Limpiar
                    </button>
                    <button type="submit" disabled={turnoSaving} className="btn-chip btn-emerald" style={{ minWidth: 180 }}>
                      {turnoSaving ? "Guardando…" : turnoEditId ? "Guardar cambios" : "Crear turno"}
                    </button>
                  </div>
                </form>

                {/* Lista de turnos */}
                <div style={{ overflowX: "auto" }}>
                  <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th align="left">Nombre</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Tolerancia</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turnosAll.map((t) => {
                        const badge = t.activo
                          ? { text: "Activo", bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", color: "#065f46" }
                          : { text: "Inactivo", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.35)", color: "#991b1b" };
                        return (
                          <tr key={t.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                            <td>{t.nombre}</td>
                            <td align="center">{to12h(t.horaEntrada)}</td>
                            <td align="center">{to12h(t.horaSalida)}</td>
                            <td align="center">{t.toleranciaMinutos} min</td>
                            <td align="center">
                              <span
                                style={{
                                  padding: "4px 10px", borderRadius: 999, fontWeight: 700, fontSize: 12,
                                  background: badge.bg, border: `1px solid ${badge.bd}`, color: badge.color,
                                }}
                              >
                                {badge.text}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                                <button className="btn-chip btn-indigo" onClick={() => editarTurno(t)}>Editar</button>
                                {t.activo ? (
                                  <button className="btn-chip btn-danger" onClick={() => alternarActivoTurno(t)}>Desactivar</button>
                                ) : (
                                  <button className="btn-chip btn-emerald" onClick={() => alternarActivoTurno(t)}>Activar</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {turnosAll.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Sin turnos</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* estilos de botones compartidos */}
      <style>{`
        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:700;
          box-shadow:0 4px 14px rgba(189, 195, 217, 0.12); cursor:pointer; transition:filter .12s, transform .05s;
          display:inline-flex; align-items:center; justify-content:center; height:38px; line-height:1; white-space:nowrap;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-indigo{ background:linear-gradient(135deg,#6366f1,#7c3aed); color:#fff; }
        .btn-emerald{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff; }
        .btn-slate{ background:#475569; color:#fff; }
        .btn-danger{ background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; }
      `}</style>
    </div>
  );
}
