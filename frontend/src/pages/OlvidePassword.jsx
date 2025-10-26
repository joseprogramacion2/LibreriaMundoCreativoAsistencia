import React, { useState } from 'react';
import axios from 'axios';
import './Login.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export default function OlvidePassword() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) {
      setError('Ingresa tu correo registrado.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, {
        usuarioOrCorreo: identifier.trim(),
      });
      setDone(true);
    } catch {
      setDone(true); // misma UX para no filtrar info
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <div className="logo">MC</div>
          <div>
            <h1 style={{ marginBottom: 2 }}>Recuperar acceso</h1>
            <p className="subtitle">Te enviaremos una contraseña temporal</p>
          </div>
        </div>

        {done ? (
          <>
            <div className="notice-info">
              Si el correo existe y está activo, te enviamos una <b>contraseña temporal</b>.
              Revisa tu bandeja y spam.
            </div>
            <a className="btn-primary btn-wide" href="/login">Volver al inicio de sesión</a>
            <div className="foot" style={{ marginTop: 10 }}>
              <a href="/login" style={{ color:'#334155', textDecoration:'none' }}>Volver a iniciar sesión</a>
            </div>
          </>
        ) : (
          <>
            {error && <div className="alert">{error}</div>}

            <form onSubmit={handleSubmit} className="form">
              <div className="input-group">
                <label htmlFor="id">Correo</label>
                <input
                  id="id"
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tu@correo.com"
                />
              </div>

              <button className="btn-primary" type="submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar temporal'}
              </button>

              <div className="foot" style={{ marginTop: 10 }}>
                <a href="/login" style={{ color:'#334155', textDecoration:'none' }}>Volver a iniciar sesión</a>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
