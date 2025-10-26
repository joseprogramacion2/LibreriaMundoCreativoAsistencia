import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

export default function Sucursales() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos"); // todos | activas | inactivas

  // Modal Crear/Editar
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ nombre: "", direccion: "", activo: true });

  // Modal Confirmación (activar/desactivar)
  const [confirmData, setConfirmData] = useState(null); // { id, nombre, nuevoEstado, error? }

  function onFormChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }
  function resetForm() {
    setForm({ nombre: "", direccion: "", activo: true });
  }

  async function fetchRows() {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/sucursales`, { headers });
      setRows(Array.isArray(data) ? data : data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  // Filtro local
  const rowsFiltradas = useMemo(() => {
    let list = rows;
    if (filtroTexto.trim()) {
      const q = filtroTexto.toLowerCase();
      list = list.filter(
        (r) =>
          String(r.id).includes(q) ||
          r.nombre.toLowerCase().includes(q) ||
          (r.direccion || "").toLowerCase().includes(q)
      );
    }
    if (filtroEstado === "activas") list = list.filter((r) => !!r.activo);
    if (filtroEstado === "inactivas") list = list.filter((r) => !r.activo);
    return list;
  }, [rows, filtroTexto, filtroEstado]);

  // Abrir modales
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
    setForm({ nombre: r.nombre || "", direccion: r.direccion || "", activo: !!r.activo });
    setMsg("");
    setShowModal(true);
  }
  function cerrarModal() {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setMsg("");
  }

  // Guardar (crear/editar)
  async function guardarSucursal(e) {
    e.preventDefault();
    setMsg("");
    if (!form.nombre.trim()) return setMsg("El nombre es obligatorio.");

    const payload = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim() || null,
      activo: !!form.activo,
    };

    setSaving(true);
    try {
      if (modalMode === "edit" && editingId) {
        await axios.put(`${API_BASE}/sucursales/${editingId}`, payload, { headers });
        setMsg("✅ Sucursal actualizada");
      } else {
        await axios.post(`${API_BASE}/sucursales`, payload, { headers });
        setMsg("✅ Sucursal creada");
      }
      await fetchRows();
      setTimeout(() => cerrarModal(), 250);
    } catch (err) {
      const em =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "❌ No se pudo guardar la sucursal.";
      setMsg(em);
    } finally {
      setSaving(false);
    }
  }

  // Confirmación activar/desactivar
  function pedirConfirmacionEstado(r) {
    setConfirmData({ id: r.id, nombre: r.nombre, nuevoEstado: !r.activo, error: "" });
  }

  async function confirmarEstado() {
    if (!confirmData) return;
    try {
      await axios.put(
        `${API_BASE}/sucursales/${confirmData.id}`,
        { activo: confirmData.nuevoEstado },
        { headers }
      );
      setConfirmData(null);
      fetchRows();
    } catch (e) {
      const m =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "❌ No se pudo cambiar el estado.";
      setConfirmData((prev) => ({ ...(prev || {}), error: m }));
    }
  }

  // Badges
  function EstadoBadge({ activo }) {
    const s = activo
      ? {
          text: "Activo",
          bg: "rgba(16,185,129,.12)",
          bd: "rgba(16,185,129,.35)",
          color: "#065f46",
        }
      : {
          text: "Inactivo",
          bg: "rgba(239,68,68,.10)",
          bd: "rgba(239,68,68,.35)",
          color: "#991b1b",
        };
    return (
      <span
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 12,
          background: s.bg,
          border: `1px solid ${s.bd}`,
          color: s.color,
        }}
      >
        {s.text}
      </span>
    );
  }

  return (
    <div style={{ paddingRight: 8 }}>
      {/* Barra de acciones + filtros */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button onClick={abrirCrear} className="btn-chip btn-emerald">
          ➕ Agregar sucursal
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            placeholder="Buscar por ID, nombre o dirección"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              minWidth: 260,
            }}
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="todos">Todas</option>
            <option value="activas">Activas</option>
            <option value="inactivas">Inactivas</option>
          </select>
        </div>
      </div>

      {/* Mensaje global */}
      {msg && (
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: 10,
            color: /✅/.test(msg) ? "#065f46" : "#991b1b",
            background: /✅/.test(msg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
            border: `1px solid ${
              /✅/.test(msg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"
            }`,
          }}
        >
          {msg}
        </div>
      )}

      {/* Tabla */}
      <div style={{ overflowX: "auto" }}>
        <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">ID</th>
              <th align="left">Nombre</th>
              <th align="left">Dirección</th>
              <th align="center">Estado</th>
              <th align="left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rowsFiltradas.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td>#{r.id}</td>
                <td>{r.nombre}</td>
                <td>{r.direccion || "-"}</td>
                <td align="center">
                  <EstadoBadge activo={r.activo} />
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-chip btn-indigo" onClick={() => abrirEditar(r)}>
                      Editar
                    </button>
                    {r.activo ? (
                      <button
                        className="btn-chip btn-danger"
                        onClick={() => pedirConfirmacionEstado(r)}
                        title="Desactivar sucursal"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button
                        className="btn-chip btn-emerald"
                        onClick={() => pedirConfirmacionEstado(r)}
                        title="Activar sucursal"
                      >
                        Activar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rowsFiltradas.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                  {loading ? "Cargando…" : "Sin sucursales"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL Crear/Editar */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
        >
          <div
            style={{
              width: "min(680px, 92vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 14,
                background: "linear-gradient(90deg,#3b82f6,#10b981)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {modalMode === "edit" ? `Editar sucursal #${editingId}` : "Nueva sucursal"}
              </div>
              <button
                onClick={cerrarModal}
                style={{ background: "transparent", color: "#fff", border: "none", fontSize: 18 }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {msg && (
              <div
                style={{
                  margin: 12,
                  padding: 10,
                  borderRadius: 10,
                  color: /✅/.test(msg) ? "#065f46" : "#991b1b",
                  background: /✅/.test(msg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
                  border: `1px solid ${
                    /✅/.test(msg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"
                  }`,
                }}
              >
                {msg}
              </div>
            )}

            <form onSubmit={guardarSucursal} style={{ padding: 16, display: "grid", gap: 12 }}>
              <input
                name="nombre"
                placeholder="Nombre de la sucursal *"
                value={form.nombre}
                onChange={onFormChange}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
                autoFocus
              />
              <input
                name="direccion"
                placeholder="Dirección (opcional)"
                value={form.direccion}
                onChange={onFormChange}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  name="activo"
                  checked={form.activo}
                  onChange={onFormChange}
                />{" "}
                Activa
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 6 }}>
                <button type="button" onClick={cerrarModal} className="btn-chip btn-slate">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-chip btn-emerald"
                  style={{ minWidth: 180 }}
                >
                  {saving ? "Guardando…" : modalMode === "edit" ? "Guardar cambios" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL Confirmación estado */}
      {confirmData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,6,23,.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(520px, 92vw)",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(59,130,246,.12)",
                  display: "grid",
                  placeItems: "center",
                  color: "#1d4ed8",
                  fontWeight: 800,
                }}
              >
                !
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Confirmar acción</div>
                <div style={{ color: "#475569" }}>
                  ¿Seguro que deseas {confirmData.nuevoEstado ? "activar" : "desactivar"} la
                  sucursal <strong>#{confirmData.id} — {confirmData.nombre}</strong>?
                </div>
              </div>
            </div>

            {confirmData?.error && (
              <div
                style={{
                  margin: 12,
                  padding: 10,
                  borderRadius: 10,
                  color: "#991b1b",
                  background: "rgba(239,68,68,.10)",
                  border: "1px solid rgba(239,68,68,.35)",
                }}
              >
                ❌ {confirmData.error}
              </div>
            )}

            <div style={{ padding: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setConfirmData(null)} className="btn-chip btn-slate">
                Cancelar
              </button>
              {confirmData.nuevoEstado ? (
                <button onClick={confirmarEstado} className="btn-chip btn-emerald">
                  Activar
                </button>
              ) : (
                <button onClick={confirmarEstado} className="btn-chip btn-danger">
                  Desactivar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* estilos de botones compartidos */}
      <style>{`
        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:700;
          box-shadow:0 4px 14px rgba(2,6,23,.12);
          cursor:pointer; transition:filter .12s, transform .05s;
          display:inline-flex; align-items:center; justify-content:center;
          height:38px; line-height:1; white-space:nowrap;
        }
        .btn-chip:active{ transform:translateY(1px) }
        .btn-indigo{ background:linear-gradient(135deg,#6366f1,#7c3aed); color:#fff }
        .btn-emerald{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff }
        .btn-slate{ background:#475569; color:#fff }
        .btn-danger{ background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff }
      `}</style>
    </div>
  );
}
