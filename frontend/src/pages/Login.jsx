// frontend/src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Login.css';
import { getAuth, setAuth, clearAuth } from '../utils/auth';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export default function Login() {
  const { token: alreadyLogged, remember: savedRemember } = getAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(savedRemember);

  // Si ya hay token, consulta /auth/me para decidir a dónde mandar
  useEffect(() => {
    async function checkExisting() {
      try {
        const { data } = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${alreadyLogged}` },
        });
        if (data?.mustChange) window.location.replace('/cambiar-password');
        else window.location.replace('/inicio');
      } catch {
        clearAuth();
      }
    }
    if (alreadyLogged) checkExisting();
  }, [alreadyLogged]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!usuario.trim() || !password.trim()) {
      setError('Por favor completa usuario y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API_BASE}/auth/login`, {
        usuario: usuario.trim(), // backend acepta usuario o correo
        password,
      });

      setAuth({ token: data.token, user: data.user, remember });

      // Si el backend indica que debe cambiar contraseña, redirige
      if (data?.mustChange) {
        window.location.replace('/cambiar-password');
      } else {
        window.location.replace('/inicio');
      }
    } catch {
      setError('Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="brand">
          <div className="logo">MC</div>
          <div>
            <h1>Iniciar sesión</h1>
            <p className="subtitle">Panel de asistencia</p>
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        <form onSubmit={handleSubmit} className="form">
          <div className="input-group">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Contraseña</label>
            <div className="pass-wrapper">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="eye-btn"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="currentColor"/>
                    <circle cx="12" cy="12" r="2.5" fill="#fff"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path d="M3 3l18 18-1.5 1.5L16.7 20A12.5 12.5 0 0 1 12 21C5 21 2 14 2 14s1.1-2.5 3.5-4.7L1.5 4.5 3 3Zm6.6 6.6A5 5 0 0 0 7 12a5 5 0 0 0 7.4 4.4l-1.6-1.6A2.5 2.5 0 0 1 9.9 12c0-.5.2-1 .5-1.4L9.6 9.6ZM12 5c7 0 10 7 10 7a19.7 19.7 0 0 1-3.3 4.7l-1.4-1.4A12.8 12.8 0 0 0 20 12s-3-6-8-6c-.9 0-1.7.1-2.4.3L8 5.7C9 5.3 10 5 12 5Z" fill="currentColor"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="row-between">
            <label className="remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Recordarme
            </label>
          </div>

          <div className="row-between" style={{ marginTop: 8 }}>
  <span />
  <a href="/olvide-password" style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none' }}>
    ¿Olvidaste tu contraseña?
  </a>
</div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <footer className="foot">
          <span>© {new Date().getFullYear()} Mundo Creativo</span>
        </footer>
      </div>
    </div>
  );
}
