// frontend/src/pages/Dispositivos.jsx  (reemplaza el componente completo)

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

export default function Dispositivos() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [rows, setRows] = useState([]);
  const [sucursales, setSucursales] = useState([]);

  // modal crear/editar
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit
  const [editingId, setEditingId] = useState(null);

  // confirm activar/desactivar
  const [confirmData, setConfirmData] = useState(null); // { id, nombre, nuevoEstado }

  // mensajes y estados
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // nuevo: estado de prueba por dispositivo
  const [testingId, setTestingId] = useState(null);
  const [reach, setReach] = useState({}); // { [id]: { reachable: bool, code?:string, when:number } }

  const [form, setForm] = useState({
    nombre: "",
    modelo: "",
    ip: "",
    sucursalId: "",
    activo: true,
  });

  // 👉 Solo sucursales activas para el selector
  const sucursalesActivas = useMemo(
    () => (Array.isArray(sucursales) ? sucursales.filter((s) => !!s.activo) : []),
    [sucursales]
  );

  // Si estamos editando y la sucursal actual está inactiva, la mostramos marcada como INACTIVA
  const sucursalSeleccionada = useMemo(() => {
    const idSel = Number(form.sucursalId || 0);
    return sucursales.find((s) => Number(s.id) === idSel) || null;
  }, [form.sucursalId, sucursales]);

  function resetForm() {
    setForm({ nombre: "", modelo: "", ip: "", sucursalId: "", activo: true });
  }
  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  async function fetchAll() {
    setLoading(true);
    try {
      const [d1, d2] = await Promise.all([
        axios.get(`${API_BASE}/dispositivos`, { headers }),
        axios.get(`${API_BASE}/sucursales`, { headers }),
      ]);
      setRows(Array.isArray(d1.data) ? d1.data : d1.data.items || []);
      setSucursales(Array.isArray(d2.data) ? d2.data : d2.data.items || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ====== abrir/cerrar modal ====== */
  function abrirCrear() {
    setModalMode("create");
    setEditingId(null);
    setMsg("");
    resetForm();
    setShowModal(true);
  }
  function abrirEditar(r) {
    setModalMode("edit");
    setEditingId(r.id);
    setMsg("");
    setForm({
      nombre: r.nombre || "",
      modelo: r.modelo || "",
      ip: r.ip || "",
      sucursalId: String(r.sucursalId || ""),
      activo: !!r.activo,
    });
    setShowModal(true);
  }
  function cerrarModal() {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setMsg("");
  }

  /* ====== crear/actualizar ====== */
  function ipValida(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
  }
  async function guardar(e) {
    e.preventDefault();
    setMsg("");

    if (!form.nombre.trim() || !form.modelo.trim())
      return setMsg("Completa nombre y modelo.");
    if (!ipValida(form.ip.trim()))
      return setMsg("IP inválida (usa IPv4, ej. 192.168.1.200).");
    if (!form.sucursalId) return setMsg("Selecciona una sucursal.");

    const payload = {
      nombre: form.nombre.trim(),
      modelo: form.modelo.trim(),
      ip: form.ip.trim(),
      sucursalId: Number(form.sucursalId),
      activo: !!form.activo,
    };

    setSaving(true);
    try {
      if (modalMode === "edit" && editingId) {
        await axios.put(`${API_BASE}/dispositivos/${editingId}`, payload, { headers });
        setMsg("✅ Dispositivo actualizado");
      } else {
        await axios.post(`${API_BASE}/dispositivos`, payload, { headers });
        setMsg("✅ Dispositivo creado");
      }
      await fetchAll();
      setTimeout(() => cerrarModal(), 300);
    } catch (e) {
      setMsg("❌ Error al guardar. Revisa nombre/IP/sucursal.");
    } finally {
      setSaving(false);
    }
  }

  /* ====== activar/desactivar (con confirm) ====== */
  function pedirConfirm(r) {
    setConfirmData({ id: r.id, nombre: r.nombre, nuevoEstado: !r.activo });
  }
  async function confirmarEstado() {
    if (!confirmData) return;
    try {
      await axios.put(
        `${API_BASE}/dispositivos/${confirmData.id}`,
        { activo: confirmData.nuevoEstado },
        { headers }
      );
      setConfirmData(null);
      await fetchAll();
    } catch {
      setMsg("❌ No se pudo cambiar el estado.");
      setConfirmData(null);
    }
  }

  /* ====== acciones de dispositivo ====== */
  const humanFromCode = (code) => {
    switch (code) {
      case "TIMEOUT": return "⏱️ Tiempo de espera agotado (posible apagado o red bloqueada)";
      case "REFUSED": return "⛔ Conexión rechazada (puerto 4370 cerrado o daemon caído)";
      case "UNREACHABLE": return "🌐 Host/red inalcanzable (ruta/VLAN/ACL)";
      case "DNS": return "🧭 Error DNS temporal";
      case "UNKNOWN": return "❓ Error desconocido";
      default: return "";
    }
  };

  async function testDevice(id) {
    setMsg("");
    setTestingId(id);
    try {
      const { data } = await axios.post(`${API_BASE}/dispositivos/${id}/test`, {}, { headers });
      setReach((r) => ({ ...r, [id]: { reachable: true, code: "OK", when: Date.now() } }));
      setMsg("✅ Conexión OK");
    } catch (err) {
      const data = err?.response?.data || {};
      const code = data.code || "UNKNOWN";
      setReach((r) => ({ ...r, [id]: { reachable: false, code, when: Date.now() } }));
      const extra = humanFromCode(code);
      setMsg(`❌ Sin conexión${extra ? ` — ${extra}` : ""}`);
    } finally {
      setTestingId(null);
    }
  }

  async function syncDevice(id) {
    setMsg("");
    try {
      const { data } = await axios.post(`${API_BASE}/dispositivos/${id}/sync`, {}, { headers });
      setMsg(
        data?.ok
          ? `✅ Sincronizado. Nuevos: ${data.insertados ?? 0}`
          : data?.message || "❌ Falló la sincronización"
      );
      await fetchAll();
    } catch {
      setMsg("❌ Error al sincronizar.");
    }
  }

  /* ====== UI ====== */
  return (
    <div style={{ paddingRight: 8 }}>
      {/* barra acciones */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={abrirCrear} className="btn-chip btn-emerald">➕ Agregar dispositivo</button>

        {msg && (
          <div
            style={{
              marginLeft: "auto",
              padding: "8px 10px",
              borderRadius: 10,
              color: /✅/.test(msg) ? "#065f46" : "#991b1b",
              background: /✅/.test(msg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
              border: `1px solid ${/✅/.test(msg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"}`,
              maxWidth: 680,
            }}
          >
            {msg}
          </div>
        )}
      </div>

      {/* tabla */}
      <div style={{ overflowX: "auto" }}>
        <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              <th align="left">Nombre</th>
              <th align="left">Modelo</th>
              <th align="left">IP</th>
              <th align="left">Sucursal</th>
              <th align="center">Estado</th>
              <th align="center">Conectividad</th>
              <th align="left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const badge = r.activo
                ? { text: "Activo", bg: "rgba(16,185,129,.12)", bd: "rgba(16,185,129,.35)", color: "#065f46" }
                : { text: "Inactivo", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.35)", color: "#991b1b" };

              const hit = reach[r.id];
              const conn = hit
                ? hit.reachable
                  ? { text: "Online", bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.35)", color: "#1d4ed8" }
                  : { text: "Offline", bg: "rgba(239,68,68,.10)", bd: "rgba(239,68,68,.35)", color: "#991b1b" }
                : null;

              return (
                <tr key={r.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td>{r.nombre}</td>
                  <td>{r.modelo}</td>
                  <td>{r.ip}</td>
                  <td>{r.sucursal?.nombre || "-"}</td>
                  <td align="center">
                    <span style={{
                      padding: "4px 10px", borderRadius: 999, fontWeight: 700, fontSize: 12,
                      background: badge.bg, border: `1px solid ${badge.bd}`, color: badge.color,
                    }}>
                      {badge.text}
                    </span>
                  </td>
                  <td align="center">
                    {conn ? (
                      <span style={{
                        padding: "4px 10px", borderRadius: 999, fontWeight: 700, fontSize: 12,
                        background: conn.bg, border: `1px solid ${conn.bd}`, color: conn.color,
                      }}>
                        {conn.text}
                      </span>
                    ) : (
                      <span style={{ color: "#64748b", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="btn-chip btn-indigo" onClick={() => abrirEditar(r)}>
                        Editar
                      </button>
                      {r.activo ? (
                        <button className="btn-chip btn-danger" onClick={() => pedirConfirm(r)}>
                          Desactivar
                        </button>
                      ) : (
                        <button className="btn-chip btn-emerald" onClick={() => pedirConfirm(r)}>
                          Activar
                        </button>
                      )}
                    

                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#64748b" }}>
                  Sin dispositivos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL crear/editar */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(2,6,23,.6)",
            display: "grid", placeItems: "center", zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(760px, 92vw)", background: "#fff", borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 14, background: "linear-gradient(90deg,#3b82f6,#10b981)",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {modalMode === "edit" ? "Editar dispositivo" : "Nuevo dispositivo"}
              </div>
              <button
                onClick={cerrarModal}
                style={{ background: "transparent", color: "#fff", border: "none", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {msg && (
              <div
                style={{
                  margin: 12, padding: 10, borderRadius: 10,
                  color: /✅/.test(msg) ? "#065f46" : "#991b1b",
                  background: /✅/.test(msg) ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)",
                  border: `1px solid ${/✅/.test(msg) ? "rgba(16,185,129,.35)" : "rgba(239,68,68,.35)"}`,
                }}
              >
                {msg}
              </div>
            )}

            <form onSubmit={guardar} style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input name="nombre" placeholder="Nombre (K14 Recepción)" value={form.nombre} onChange={onChange}
                       style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <input name="modelo" placeholder="Modelo (ej. K14)" value={form.modelo} onChange={onChange}
                       style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input name="ip" placeholder="IP (192.168.1.200)" value={form.ip} onChange={onChange}
                       style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }} />
                <select name="sucursalId" value={form.sucursalId} onChange={onChange}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <option value="">Sucursal *</option>

                  {/* Si la sucursal actual está INACTIVA, muéstrala como referencia */}
                  {modalMode === "edit" && sucursalSeleccionada && !sucursalSeleccionada.activo && (
                    <option value={sucursalSeleccionada.id} disabled>
                      [INACTIVA] {sucursalSeleccionada.nombre}
                    </option>
                  )}

                  {/* Solo sucursales ACTIVAS para elegir */}
                  {sucursalesActivas.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="activo" checked={form.activo} onChange={onChange} />
                Activo
              </label>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 6 }}>
                <button type="button" onClick={cerrarModal} className="btn-chip btn-slate">Cancelar</button>
                <button type="submit" disabled={saving} className="btn-chip btn-emerald" style={{ minWidth: 180 }}>
                  {saving ? "Guardando…" : modalMode === "edit" ? "Guardar cambios" : "Crear dispositivo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL confirmación estado */}
      {confirmData && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(2,6,23,.6)",
            display: "grid", placeItems: "center", zIndex: 50,
          }}
        >
          <div
            style={{
              width: "min(520px, 92vw)", background: "#fff", borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden",
            }}
          >
            <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: "rgba(59,130,246,.12)",
                display: "grid", placeItems: "center", color: "#1d4ed8", fontWeight: 800,
              }}>
                !
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Confirmar acción</div>
                <div style={{ color: "#475569" }}>
                  ¿Seguro que deseas {confirmData.nuevoEstado ? "activar" : "desactivar"}{" "}
                  <strong>{confirmData.nombre}</strong>?
                </div>
              </div>
            </div>
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

      {/* estilos */}
      <style>{`
        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:700;
          box-shadow:0 4px 14px rgba(2,6,23,.12); cursor:pointer; transition:filter .12s, transform .05s;
          display:inline-flex; align-items:center; justify-content:center; height:38px; line-height:1; white-space:nowrap;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-indigo{ background:linear-gradient(135deg,#6366f1,#7c3aed); color:#fff; }
        .btn-blue{ background:linear-gradient(135deg,#3b82f6,#06b6d4); color:#fff; }
        .btn-emerald{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff; }
        .btn-slate{ background:#475569; color:#fff; }
        .btn-danger{ background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; }
      `}</style>
    </div>
  );
}
