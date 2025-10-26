import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { getAuth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3001";

/* === helper: detectar rol super admin por nombre === */
const isSuperAdminName = (r) =>
  !!r && String(r.nombre || "").trim().toLowerCase() === "super admin";

export default function GestionRoles() {
  const { token } = getAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [roles, setRoles] = useState([]);
  const [permisos, setPermisos] = useState([]);
  const [selRol, setSelRol] = useState(null);
  const [checked, setChecked] = useState({});
  const [accesoTotal, setAccesoTotal] = useState(false);
  const [qPerm, setQPerm] = useState("");
  const [qRol, setQRol] = useState("");
  const [nuevoRol, setNuevoRol] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const filtroPermisos = useMemo(() => {
    const q = qPerm.trim().toLowerCase();
    if (!q) return permisos;
    return permisos.filter((p) => p.toLowerCase().includes(q));
  }, [permisos, qPerm]);

  const rolesFiltrados = useMemo(() => {
    const q = qRol.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.nombre.toLowerCase().includes(q));
  }, [roles, qRol]);

  const locked = isSuperAdminName(selRol); // 🔒 rol bloqueado

  async function load() {
    try {
      const [r1, r2] = await Promise.all([
        axios.get(`${API_BASE}/roles`, { headers }),
        axios.get(`${API_BASE}/permisos`, { headers }),
      ]);
      setRoles(r1.data || []);
      setPermisos(r2.data || []);
    } catch {
      setErr("Error al cargar roles o permisos.");
    }
  }

  async function selectRol(r) {
    const { data } = await axios.get(`${API_BASE}/roles/${r.id}`, { headers });
    setSelRol(data);
    const haveStar = (data?.permisos || []).includes("*");
    const mustLock = isSuperAdminName(data);
    setAccesoTotal(mustLock ? true : haveStar);
    const map = {};
    (data?.permisos || []).forEach((k) => (map[k] = true));
    setChecked(map);
    setOk("");
    setErr("");
  }

  async function crearRol() {
    try {
      const nombre = nuevoRol.trim();
      if (!nombre) return;
      await axios.post(`${API_BASE}/roles`, { nombre }, { headers });
      setNuevoRol("");
      setOk("✅ Rol creado correctamente.");
      await load();
    } catch {
      setErr("No se pudo crear el rol.");
    }
  }

  async function renombrarRol() {
    if (!selRol?.id) return;
    if (locked) {
      setErr("🔒 El rol Super Admin está protegido y no se puede renombrar.");
      return;
    }
    const nombre = prompt("Nuevo nombre del rol:", selRol.nombre);
    if (!nombre?.trim()) return;
    try {
      await axios.put(`${API_BASE}/roles/${selRol.id}`, { nombre: nombre.trim() }, { headers });
      setOk("✅ Rol renombrado.");
      await load();
      const { data } = await axios.get(`${API_BASE}/roles/${selRol.id}`, { headers });
      setSelRol(data);
    } catch {
      setErr("No se pudo renombrar el rol.");
    }
  }

  async function toggleAccesoTotal(flag) {
    if (!selRol?.id) return;
    if (locked) {
      setErr("🔒 El rol Super Admin ya tiene acceso total y no es editable.");
      return;
    }
    try {
      setAccesoTotal(flag);
      await axios.post(`${API_BASE}/roles/${selRol.id}/access-all`, { enabled: flag }, { headers });
      setChecked(flag ? { "*": true } : {});
      setOk(flag ? "✅ Acceso total habilitado." : "✅ Acceso total removido.");
    } catch {
      setErr("No se pudo actualizar acceso total.");
    }
  }

  async function seleccionarTodoCatalogo() {
    if (!selRol?.id) return;
    if (locked) {
      setErr("🔒 No es necesario aplicar catálogo al Super Admin.");
      return;
    }
    try {
      await axios.post(`${API_BASE}/roles/${selRol.id}/grant-all`, {}, { headers });
      const { data } = await axios.get(`${API_BASE}/roles/${selRol.id}`, { headers });
      setSelRol(data);
      const map = {};
      (data?.permisos || []).forEach((k) => (map[k] = true));
      setChecked(map);
      setOk("✅ Catálogo aplicado al rol.");
    } catch {
      setErr("Error aplicando catálogo al rol.");
    }
  }

  async function guardarPermisos() {
    if (!selRol?.id) return;
    if (locked) {
      setErr("🔒 El rol Super Admin está protegido y no se pueden modificar sus permisos.");
      return;
    }
    try {
      setLoading(true);
      const list = Object.keys(checked).filter((k) => checked[k] && k !== "*");
      await axios.put(`${API_BASE}/roles/${selRol.id}/permisos`, { permisos: list }, { headers });
      setOk("✅ Cambios guardados correctamente.");
      setErr("");
      setLoading(false);
    } catch {
      setLoading(false);
      setErr("❌ No se pudieron guardar los cambios.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-wrap">
      <h2 style={{ marginBottom: 16 }}>Gestión de Roles</h2>

      <div className="split-2col">
        {/* ==== IZQUIERDA ==== */}
        <div className="card">
          <h3>Roles existentes</h3>

          <div style={{ display: "flex", gap: 8, margin: "8px 0 12px" }}>
            <input
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value)}
              placeholder="Nombre del nuevo rol"
              className="input"
            />
            <button className="btn-cta" onClick={crearRol}>Crear</button>
          </div>

          <input
            value={qRol}
            onChange={(e) => setQRol(e.target.value)}
            placeholder="Buscar rol"
            className="input"
            style={{ marginBottom: 10 }}
          />

          {rolesFiltrados.map((r) => (
            <button
              key={r.id}
              onClick={() => selectRol(r)}
              className={`btn-chip ${selRol?.id === r.id ? "btn-emerald" : "btn-slate"}`}
            >
              {r.nombre}
            </button>
          ))}
        </div>

        {/* ==== DERECHA ==== */}
        <div className="card">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>
              Permisos del rol {selRol ? `: ${selRol.nombre}` : ""}
            </h3>
            {selRol && (
              <button
                className="btn-chip btn-indigo"
                onClick={renombrarRol}
                disabled={locked}
                title={locked ? "Rol protegido" : "Editar nombre"}
              >
                Editar nombre
              </button>
            )}
          </div>

          {locked && (
            <div className="alert" style={{ borderColor: "#475569", background: "#f1f5f9", color: "#0f172a" }}>
              🔒 El rol <strong>Super Admin</strong> está protegido. No es posible renombrarlo ni modificar permisos.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={accesoTotal || locked}
                onChange={(e) => toggleAccesoTotal(e.target.checked)}
                disabled={!selRol || locked}
              />
              <strong>Acceso total</strong>
            </label>

            <button
              className="btn-chip btn-blue"
              disabled={!selRol || locked}
              onClick={seleccionarTodoCatalogo}
              title={locked ? "Rol protegido" : "Aplicar catálogo al rol"}
            >
              Aplicar catálogo al rol
            </button>
            <input
              placeholder="Buscar permiso"
              value={qPerm}
              onChange={(e) => setQPerm(e.target.value)}
              className="input"
              style={{ flex: 1 }}
            />
          </div>

          {/* === Permisos === */}
          <div className="perm-grid">
            {filtroPermisos.map((p) => (
              <label key={p} className="perm-item">
                <input
                  type="checkbox"
                  disabled={accesoTotal || !selRol || locked}
                  checked={!!checked[p]}
                  onChange={(e) =>
                    setChecked((old) => ({ ...old, [p]: e.target.checked }))
                  }
                />
                <div>
                  <div className="perm-name">{p}</div>
                </div>
              </label>
            ))}
          </div>

          {err && <div className="alert">{err}</div>}
          {ok && <div className="alert ok">{ok}</div>}

          <button
            className="btn-cta"
            onClick={guardarPermisos}
            disabled={!selRol || loading || locked}
            title={locked ? "Rol protegido" : "Guardar cambios"}
          >
            {loading ? "Guardando…" : "Guardar Cambios"}
          </button>
        </div>
      </div>

      {/* ====== ESTILOS ====== */}
      <style>{`
        .split-2col {
          display: grid;
          grid-template-columns: minmax(320px, 1fr) 1.5fr;
          gap: 16px;
        }
        @media (max-width: 1000px) {
          .split-2col { grid-template-columns: 1fr; }
        }
        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 18px;
          box-shadow: 0 4px 18px rgba(0,0,0,0.06);
        }
        .input {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          outline: none;
          font-size: 15px;
        }
        .input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,.15);
        }
        .btn-chip {
          border: none;
          border-radius: 999px;
          padding: 8px 14px;
          font-weight: 700;
          cursor: pointer;
          color: #fff;
        }
        .btn-indigo { background: linear-gradient(135deg,#6366f1,#7c3aed); }
        .btn-blue { background: linear-gradient(135deg,#3b82f6,#06b6d4); }
        .btn-emerald { background: linear-gradient(135deg,#10b981,#22c55e); }
        .btn-slate { background: #475569; }
        .btn-cta {
          width: 100%;
          margin-top: 16px;
          padding: 12px 14px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg,#6366f1,#22c55e);
          color: #fff;
          font-weight: 800;
          cursor: pointer;
        }
        .alert {
          margin: 10px 0;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #f87171;
          background: #fef2f2;
          color: #b91c1c;
          font-weight: 600;
        }
        .alert.ok {
          border-color: #22c55e;
          background: #ecfdf5;
          color: #166534;
        }
        .perm-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }
        .perm-item {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #f9fafb;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 12px;
        }
        .perm-name { font-weight: 700; color: #111827; }
      `}</style>
    </div>
  );
}
