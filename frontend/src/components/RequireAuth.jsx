// frontend/src/components/RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { getAuth, clearAuth } from '../utils/auth';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export default function RequireAuth({ children }) {
  const location = useLocation();
  const { token } = getAuth();
  const [state, setState] = useState({ loading: true, ok: false, mustChange: false });

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      if (!token) {
        if (mounted) setState({ loading: false, ok: false, mustChange: false });
        return;
      }
      try {
        const { data } = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mounted) setState({ loading: false, ok: true, mustChange: !!data?.mustChange });
      } catch {
        clearAuth();
        if (mounted) setState({ loading: false, ok: false, mustChange: false });
      }
    }

    checkSession();
    return () => { mounted = false; };
  }, [token]);

  if (state.loading) return null; // si quieres, muestra un spinner

  // Sin token / sesión inválida -> al login
  if (!state.ok) return <Navigate to="/" replace state={{ from: location }} />;

  // Debe cambiar contraseña pero no está en la ruta correcta -> forzar
  if (state.mustChange && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }

  // Ya no debe cambiar y está en /cambiar-password -> al panel
  if (!state.mustChange && location.pathname === '/cambiar-password') {
    return <Navigate to="/panel" replace />;
  }

  return children;
}
