// frontend/src/pages/Usuarios/Usuarios.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { getAuth } from '../../utils/auth';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export default function Usuarios() {
  const { token } = getAuth();

  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');

  const [form, setForm] = useState({ nombre:'', usuario:'', correo:'', rolId:'' });
  const [edit, setEdit]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok,  setOk]  = useState('');

  const [showTrash, setShowTrash] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState({ title:'', body:'', action:null, danger:false });

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_BASE}/auth/roles`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({data}) => setRoles(Array.isArray(data) ? data : []))
      .catch(() => setRoles([]));
    loadUsers();
    // eslint-disable-next-line
  }, [token]);

  async function loadUsers(query = q) {
    if (!token) return;
    const { data } = await axios.get(`${API_BASE}/auth/users`, {
      params: { page: 1, size: 999, q: query },
      headers: { Authorization: `Bearer ${token}` },
    });
    setUsers(data.items || []);
  }

  // 🔎 Búsqueda en vivo (debounce)
  useEffect(() => {
    const h = setTimeout(() => { loadUsers(q); }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line
  }, [q]);

  const usersActivos   = useMemo(() => users.filter(u => u.activo), [users]);
  const usersInactivos = useMemo(() => users.filter(u => !u.activo), [users]);

  const grouped = useMemo(() => {
    const source = showTrash ? usersInactivos : usersActivos;
    const map = {};
    for (const u of source) {
      const k = u.rol || 'Sin rol';
      if (!map[k]) map[k] = [];
      map[k].push(u);
    }
    Object.keys(map).forEach(k => map[k].sort((a,b)=>a.nombre.localeCompare(b.nombre)));
    return map;
  }, [usersActivos, usersInactivos, showTrash]);

  // ⛔ Excluir Super Admin del selector de roles
  const rolesSinSuper = useMemo(
    () => roles.filter(r => r.nombre !== 'Super Admin'),
    [roles]
  );

  function onChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function openConfirm({ title, body, action, danger=false }) {
    setConfirmData({ title, body, action, danger });
    setConfirmOpen(true);
  }
  function closeConfirm() {
    setConfirmOpen(false);
    setConfirmData({ title:'', body:'', action:null, danger:false });
  }

  function askEdit(u) {
    if (u.rol === 'Super Admin') return; // blindaje extra
    openConfirm({
      title: 'Editar usuario',
      body: `¿Quieres editar a "${u.usuario}"?`,
      action: async () => {
        setEdit({ id:u.id, nombre:u.nombre, usuario:u.usuario, correo:u.correo, rolId:u.rolId });
        setErr(''); setOk('');
      }
    });
  }

  function askResend(u) {
    openConfirm({
      title: 'Reenviar contraseña temporal',
      body: `¿Reenviar contraseña temporal a "${u.usuario}"?\nLa actual dejará de funcionar y deberá cambiarla al iniciar sesión.`,
      action: async () => {
        await axios.post(`${API_BASE}/auth/users/${u.id}/resend-temp`, {}, { headers: { Authorization: `Bearer ${token}` } });
        setOk('Contraseña temporal reenviada.');
      }
    });
  }

  function askToggle(u) {
    const next = !u.activo;
    openConfirm({
      title: `${next ? 'Activar' : 'Desactivar'} usuario`,
      body: `${next ? '¿Activar' : '¿Desactivar'} a "${u.usuario}"?`,
      danger: !next,
      action: async () => {
        await axios.patch(`${API_BASE}/auth/users/${u.id}/status`, { activo: next }, { headers: { Authorization: `Bearer ${token}` } });
        await loadUsers();
      }
    });
  }

  async function onSubmitCreate(e) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!form.nombre || !form.usuario || !form.correo || !form.rolId) {
      setErr('Completa todos los campos.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/create-user`, {
        nombre: form.nombre.trim(),
        usuario: form.usuario.trim(),
        correo: form.correo.trim(),
        rolId: Number(form.rolId),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setOk('Usuario creado. Se envió una contraseña temporal al correo.');
      setForm({ nombre:'', usuario:'', correo:'', rolId:'' });
      await loadUsers();
    } catch (e) {
      setErr(e?.response?.data?.error || 'No se pudo crear el usuario');
    } finally { setLoading(false); }
  }

  async function onSubmitEdit(e) {
    e.preventDefault();
    if (!edit) return;
    setErr(''); setOk('');
    setLoading(true);
    try {
      await axios.patch(`${API_BASE}/auth/users/${edit.id}`, {
        nombre: edit.nombre,
        usuario: edit.usuario,
        correo: edit.correo,
        rolId: edit.rolId,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setOk('Usuario actualizado.');
      setEdit(null);
      await loadUsers();
    } catch (e) {
      setErr(e?.response?.data?.error || 'No se pudo actualizar');
    } finally { setLoading(false); }
  }

  return (
    <div className="page-wrap">
      <div className="page-head row-between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Usuarios Registrados</h2>
        <div className="row-between" style={{ gap: 8 }}>
          {!showTrash ? (
            <button className="btn-chip btn-emerald" onClick={()=>setShowTrash(true)}>
              Usuarios Desactivados
            </button>
          ) : (
            <button className="btn-chip btn-slate" onClick={()=>setShowTrash(false)}>
              Volver a activos
            </button>
          )}
        </div>
      </div>

      <div className="split-2col">
        {/* IZQ: lista */}
        <div className="card left-col">
          <div className="input-group" style={{ marginBottom:12 }}>
            <label>Buscar</label>
            <input
              value={q}
              onChange={(e)=>setQ(e.target.value)}
              placeholder="Nombre, usuario o correo"
            />
          </div>

          {Object.keys(grouped).length === 0 && (
            <div style={{ color:'#64748b' }}>
              {showTrash ? 'No hay usuarios desactivados.' : 'Sin usuarios.'}
            </div>
          )}

          {Object.entries(grouped).map(([roleName, list]) => (
            <div key={roleName} style={{ marginBottom:14 }}>
              <div className="section-title">
                <span className="dot" /> {roleName} <span className="count">({list.length})</span>
              </div>

              <div className="list">
                {list.map(u => {
                  const isSuper = u.rol === 'Super Admin';
                  return (
                    <div className="list-item" key={u.id}>
                      <div className="list-main">
                        <div className="avatar">{(u.usuario || 'U').slice(0,1).toUpperCase()}</div>
                        <div className="meta">
                          <div className="title">{u.nombre}</div>
                          <div className="sub">{u.usuario} — {u.correo}</div>
                        </div>
                      </div>

                      {/* 👉 Super Admin: NO muestra acciones */}
                      {!isSuper && (
                        <div className="list-actions">
                          {!showTrash ? (
                            <>
                              <button className="btn-chip btn-indigo" onClick={()=>askEdit(u)}>Editar</button>
                              <button className="btn-chip btn-blue" onClick={()=>askResend(u)}>Reenviar temporal</button>
                              <button className="btn-chip btn-danger" onClick={()=>askToggle(u)}>Desactivar</button>
                            </>
                          ) : (
                            <button className="btn-chip btn-emerald" onClick={()=>askToggle(u)}>Activar</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* DER: registrar / editar */}
        <div className="right-col" style={{ display:'grid', gap:16 }}>
          {!edit ? (
            <div className="card">
              <h3 style={{ marginTop:0 }}>Registrar Nuevo Usuario</h3>
              <form onSubmit={onSubmitCreate} className="form">
                <div className="grid-2">
                  <div className="input-group">
                    <label>Nombre completo</label>
                    <input name="nombre" value={form.nombre} onChange={onChange} />
                  </div>
                  <div className="input-group">
                    <label>Nombre de usuario</label>
                    <input name="usuario" value={form.usuario} onChange={onChange} />
                  </div>
                  <div className="input-group">
                    <label>Correo electrónico</label>
                    <input type="email" name="correo" value={form.correo} onChange={onChange} />
                  </div>
                  <div className="input-group">
                    <label>Seleccionar un rol</label>
                    <select name="rolId" value={form.rolId} onChange={onChange}>
                      <option value="">— Selecciona —</option>
                      {rolesSinSuper.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                </div>

                {err && <div className="alert">{err}</div>}
                {ok  && <div className="alert" style={{background:'#ecfeff', borderColor:'#06b6d4', color:'#0e7490'}}>{ok}</div>}

                <button className="btn-cta" disabled={loading}>
                  {loading ? 'Creando…' : 'Crear usuario'}
                </button>
              </form>
            </div>
          ) : (
            <div className="card">
              <div className="row-between">
                <h3 style={{ marginTop:0 }}>Editar usuario</h3>
                <button className="btn-chip btn-slate" onClick={()=>setEdit(null)}>Cerrar</button>
              </div>
              <form onSubmit={onSubmitEdit} className="form">
                <div className="grid-2">
                  <div className="input-group">
                    <label>Nombre completo</label>
                    <input value={edit.nombre} onChange={e=>setEdit({...edit, nombre:e.target.value})} />
                  </div>
                  <div className="input-group">
                    <label>Nombre de usuario</label>
                    <input value={edit.usuario} onChange={e=>setEdit({...edit, usuario:e.target.value})} />
                  </div>
                  <div className="input-group">
                    <label>Correo electrónico</label>
                    <input type="email" value={edit.correo} onChange={e=>setEdit({...edit, correo:e.target.value})} />
                  </div>
                  <div className="input-group">
                    <label>Rol</label>
                    <select value={edit.rolId} onChange={e=>setEdit({...edit, rolId:Number(e.target.value)})}>
                      {rolesSinSuper.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                    </select>
                  </div>
                </div>

                {err && <div className="alert">{err}</div>}
                {ok  && <div className="alert" style={{background:'#ecfeff', borderColor:'#06b6d4', color:'#0e7490'}}>{ok}</div>}

                <button className="btn-cta" disabled={loading}>
                  {loading ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmación */}
      <div
        className={`pg-modal ${confirmOpen ? 'pg-show' : ''}`}
        aria-hidden={!confirmOpen}
        role="dialog"
        aria-modal="true"
        onClick={(e) => { if (e.target.classList.contains('pg-modal')) closeConfirm(); }}
      >
        <div className="pg-modal-card" role="document">
          <div className="pg-modal-head">
            <div className="pg-modal-icon">{confirmData.danger ? '!' : '✓'}</div>
            <div className="pg-modal-title">{confirmData.title}</div>
          </div>
        <div className="pg-modal-body" style={{whiteSpace:'pre-line'}}>{confirmData.body}</div>
          <div className="pg-modal-actions">
            <button className="pg-btn-outline" onClick={closeConfirm}>Cancelar</button>
            <button
              className="pg-btn-danger"
              style={{ background: confirmData.danger ? '' : 'linear-gradient(135deg,#10b981,#22c55e)', borderColor: confirmData.danger ? '' : '#16a34a' }}
              onClick={async ()=>{ try { await confirmData.action?.(); } finally { closeConfirm(); } }}
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>

      {/* estilos extra */}
      <style>{`
        .split-2col{
          display:grid; grid-template-columns: minmax(480px, 1fr) minmax(420px, 1fr);
          gap:16px; align-items:start;
        }
        @media (max-width: 1100px){ .split-2col{ grid-template-columns: 1fr; } }
        .left-col{ max-height: calc(100vh - 210px); overflow:auto; }

        .section-title{font-weight:800;margin:8px 0 6px;display:flex;align-items:center;gap:8px}
        .section-title .count{color:#64748b;font-weight:700}
        .section-title .dot{width:6px;height:6px;border-radius:999px;background:#6366f1;display:inline-block}

        .list{display:flex;flex-direction:column;gap:8px}
        .list-item{
          display:flex;align-items:center;gap:10px;justify-content:space-between;
          padding:10px;border:1px solid var(--pg-border);border-radius:12px;background:#fff;
        }
        .list-main{display:flex;align-items:center;gap:10px}
        .avatar{
          width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;font-weight:900;
          background:linear-gradient(135deg,#6366f1,#10b981);
        }
        .meta .title{font-weight:800}
        .meta .sub{font-size:12px;color:#64748b}
        .list-actions{display:flex;align-items:center;gap:6px}

        /* --------- Botones más lindos (pastilla + gradientes) --------- */
        .btn-chip{
          appearance:none;border:none;border-radius:999px;padding:8px 12px;font-weight:700;
          box-shadow:0 4px 14px rgba(2,6,23,.12); cursor:pointer; transition:filter .12s, transform .05s;
        }
        .btn-chip:active{ transform:translateY(1px); }
        .btn-indigo{ background:linear-gradient(135deg,#6366f1,#7c3aed); color:#fff; }
        .btn-blue{ background:linear-gradient(135deg,#3b82f6,#06b6d4); color:#fff; }
        .btn-emerald{ background:linear-gradient(135deg,#10b981,#22c55e); color:#fff; }
        .btn-slate{ background:#475569; color:#fff; }
        .btn-danger{ background:linear-gradient(135deg,#ef4444,#dc2626); color:#fff; }

        .btn-cta{
          width:100%; appearance:none; border:none; border-radius:12px; padding:12px 14px;
          font-weight:800; letter-spacing:.2px; color:#fff;
          background:linear-gradient(135deg,#6366f1,#22c55e);
          box-shadow:0 10px 20px rgba(2,6,23,.2); cursor:pointer;
          transition:filter .12s, transform .05s;
          min-height:46px; font-size:15px;
        }
        .btn-cta:hover{ filter:brightness(1.03); }
        .btn-cta:active{ transform:translateY(1px); }

        .api-hint{ font-size:12px; color:#64748b; margin-top:4px; }

        /* === BOTONES de acciones: mismo alto y sin salto de línea === */
        .list-actions .btn-chip{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          height:38px;
          padding:0 14px;
          font-size:14px;
          line-height:1;
          white-space:nowrap;
          border-radius:999px;
        }
        /* Si quieres iguales anchos, descomenta: */
        /* .list-actions .btn-chip{ min-width:150px; } */

        /* === FORM DERECHA: labels y campos más legibles === */
        .right-col .input-group label{
          font-size:14.5px;
          font-weight:700;
          color:#334155;
          margin-bottom:6px;
        }
        .right-col .input-group input,
        .right-col .input-group select{
          width:100%;
          font-size:15px;
          padding:12px 12px;
          border:1px solid #cbd5e1;
          border-radius:10px;
          background:#fff;
          box-sizing:border-box;
          outline:none;
          transition:border-color 120ms ease, box-shadow 120ms ease;
        }
        .right-col .input-group input:focus,
        .right-col .input-group select:focus{
          border-color:#6366f1;
          box-shadow:0 0 0 4px rgba(99,102,241,.15);
        }
      `}</style>
    </div>
  );
}
