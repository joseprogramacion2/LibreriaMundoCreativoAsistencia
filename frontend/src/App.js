// frontend/src/App.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import RequirePerm from './components/RequirePerm';
import Layout from './components/Layout';

import Inicio from './pages/Inicio';                 // ← NUEVO
import Dashboard from './pages/Dashboard';
import AsistenciaDiaria from './pages/Asistencia/Diaria';
import AsistenciaHistorial from './pages/Asistencia/Historial';
import SucursalesList from './pages/Sucursales/List';
import Empleados from './pages/Empleados/Empleados';
import DispositivosList from './pages/Dispositivos/List';

// NUEVAS
import CambiarPassword from './pages/CambiarPassword';
import CrearUsuario from './pages/Usuarios/Crear';
import OlvidePassword from './pages/OlvidePassword';
import GestionRoles from './pages/Roles/Gestion';

export default function App() {
  return (
    <Routes>
      {/* Público */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/olvide-password" element={<OlvidePassword />} />

      {/* Cambiar contraseña (con token, sin Layout) */}
      <Route
        path="/cambiar-password"
        element={
          <RequireAuth>
            <CambiarPassword />
          </RequireAuth>
        }
      />

      {/* Panel (con Layout) */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        {/* === INICIO (nuevo) === */}
        <Route element={<RequirePerm anyOf={['DASHBOARD']} />}>
          <Route path="/inicio" element={<Inicio />} />
        </Route>

        {/* Dashboard clásico */}
        <Route element={<RequirePerm anyOf={['DASHBOARD']} />}>
          <Route path="/panel" element={<Dashboard />} />
        </Route>

        <Route element={<RequirePerm anyOf={['ASISTENCIA_DIARIA']} />}>
          <Route path="/asistencia/diaria" element={<AsistenciaDiaria />} />
        </Route>

        <Route element={<RequirePerm anyOf={['ASISTENCIA_HISTORIAL']} />}>
          <Route path="/asistencia/historial" element={<AsistenciaHistorial />} />
        </Route>

        <Route element={<RequirePerm anyOf={['SUCURSALES']} />}>
          <Route path="/sucursales" element={<SucursalesList />} />
        </Route>

        <Route element={<RequirePerm anyOf={['EMPLEADOS']} />}>
          <Route path="/empleados" element={<Empleados />} />
        </Route>

        <Route element={<RequirePerm anyOf={['DISPOSITIVOS']} />}>
          <Route path="/dispositivos" element={<DispositivosList />} />
        </Route>

        <Route element={<RequirePerm anyOf={['USUARIOS']} />}>
          <Route path="/usuarios/crear" element={<CrearUsuario />} />
        </Route>

        <Route element={<RequirePerm anyOf={['ROLES']} />}>
          <Route path="/roles" element={<GestionRoles />} />
        </Route>

        {/* Redirección por defecto (si alguien entra a /panel/ sin ruta) */}
        <Route path="" element={<Navigate to="/inicio" replace />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
