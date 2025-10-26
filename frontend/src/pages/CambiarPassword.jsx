// frontend/src/pages/CambiarPassword.jsx
import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { getAuth, clearAuth } from '../utils/auth';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export default function CambiarPassword() {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // reglas individuales
  const hasLen = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasNum = /\d/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const allOk = useMemo(
    () => hasLen && hasUpper && hasNum && hasSpecial && matches && !!oldPassword,
    [hasLen, hasUpper, hasNum, hasSpecial, matches, oldPassword]
  );

  async function onSubmit(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!allOk) {
      setErr('La nueva contraseña no cumple los requisitos.');
      return;
    }
    const { token } = getAuth();
    if (!token) {
      setErr('Sesión expirada. Inicia de nuevo.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/change-password`,
        { oldPassword, newPassword, confirmPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMsg('¡Contraseña actualizada! Vuelve a iniciar sesión.');
      clearAuth(); // forzar re-login
      setTimeout(()=>window.location.replace('/login'), 1200);
    } catch (e) {
      setErr(e?.response?.data?.error || 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card" style={{maxWidth:560}}>
        <div className="brand">
          <div className="logo">MC</div>
          <div>
            <h1>Cambiar contraseña</h1>
            <p className="subtitle">Por seguridad debes actualizarla</p>
          </div>
        </div>

        {err && <div className="alert">{err}</div>}
        {msg && <div className="alert" style={{background:'#ecfeff', borderColor:'#06b6d4', color:'#0e7490'}}>{msg}</div>}

        <form onSubmit={onSubmit} className="form">
          <div className="input-group">
            <label>Contraseña actual (temporal)</label>
            <input type={show ? 'text' : 'password'} value={oldPassword} onChange={e=>setOld(e.target.value)} />
          </div>

          <div className="input-group">
            <label>Nueva contraseña</label>
            <div className="pass-wrapper">
              <input
                type={show ? 'text' : 'password'}
                value={newPassword}
                onChange={e=>setNew(e.target.value)}

              />
              <button
                type="button"
                className="eye-btn"
                aria-label={show ? 'Ocultar' : 'Mostrar'}
                onClick={() => setShow(v=>!v)}
                tabIndex={-1}
              >👁️</button>
            </div>

            <div className="pw-rules">
              <div className={`rule ${hasLen ? 'ok' : 'bad'}`}>Mínimo 8 caracteres</div>
              <div className={`rule ${hasUpper ? 'ok' : 'bad'}`}>Al menos 1 mayúscula</div>
              <div className={`rule ${hasNum ? 'ok' : 'bad'}`}>Al menos 1 número</div>
              <div className={`rule ${hasSpecial ? 'ok' : 'bad'}`}>Al menos 1 carácter especial</div>
            </div>
          </div>

          <div className="input-group">
            <label>Confirmar nueva contraseña</label>
            <input type={show ? 'text' : 'password'} value={confirmPassword} onChange={e=>setConfirm(e.target.value)} />
          </div>

          <button className="btn-primary" type="submit" disabled={!allOk || loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>

      {/* estilos del checklist */}
      <style>{`
        .pw-rules{margin-top:8px;display:grid;gap:6px}
        .pw-rules .rule{
          font-size:13px;font-weight:700;padding:6px 10px;border-radius:8px;
          border:1px solid #fecaca;color:#b91c1c;background:#fff1f2;
        }
        .pw-rules .rule.ok{
          border-color:#bbf7d0;color:#065f46;background:#ecfdf5;
        }
        .pw-rules .rule.bad::before{content:"✖ ";margin-right:4px}
        .pw-rules .rule.ok::before{content:"✔ ";margin-right:4px}
      `}</style>
    </div>
  );
}
