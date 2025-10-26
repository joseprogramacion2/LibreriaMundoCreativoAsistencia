// frontend/src/components/Layout.jsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getAuth, clearAuth } from "../utils/auth";
import ChatWidget from "../components/ChatWidget";

export default function Layout() {
  const { user } = getAuth();
  const [open, setOpen] = useState(false);

  // Modal de confirmación para cerrar sesión
  const [confirmOpen, setConfirmOpen] = useState(false);

  const navClass = ({ isActive }) =>
    "pg-navlink" + (isActive ? " pg-active" : "");

  function handleLogout() {
    setConfirmOpen(true);
  }
  function confirmLogout() {
    clearAuth();
    window.location.replace("/");
  }
  function cancelLogout() {
    setConfirmOpen(false);
  }

  // Cerrar con tecla ESC
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    if (confirmOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  // ===== Permisos: mismos nombres que las vistas del menú =====
  const perms = new Set((user?.permisos || []).map(String));
  const hasStar = perms.has("*");
  const can = (key) => hasStar || perms.has(key);

  // Cerrar el menú al navegar (mobile)
  const closeMenu = () => setOpen(false);

  return (
    <div className="pg-app">
      {/* TOPBAR */}
      <header className="pg-topbar">
        <div className="pg-topbar-inner pg-container">
          {/* Brand + hamburger */}
          <div className="pg-brand">
            <div className="pg-logo">A</div>
            <div className="pg-title">
              <div className="pg-title-main">Asistencia</div>
              <div className="pg-title-sub">Panel</div>
            </div>

            <button
              className="pg-burger"
              aria-label="Abrir menú"
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          {/* NAV */}
          <nav className={`pg-nav ${open ? "pg-open" : ""}`}>
            {/* NUEVO: Inicio (mismo permiso que Dashboard) */}
            {can("DASHBOARD") && (
              <NavLink to="/inicio" className={navClass} onClick={closeMenu}>
                Inicio
              </NavLink>
            )}

            {can("DASHBOARD") && (
              <NavLink to="/panel" className={navClass} onClick={closeMenu}>
                Dashboard
              </NavLink>
            )}
            {can("ASISTENCIA_DIARIA") && (
              <NavLink
                to="/asistencia/diaria"
                className={navClass}
                onClick={closeMenu}
              >
                Asistencia diaria
              </NavLink>
            )}
            {can("ASISTENCIA_HISTORIAL") && (
              <NavLink
                to="/asistencia/historial"
                className={navClass}
                onClick={closeMenu}
              >
                Historial
              </NavLink>
            )}
            {can("SUCURSALES") && (
              <NavLink to="/sucursales" className={navClass} onClick={closeMenu}>
                Sucursales
              </NavLink>
            )}
            {can("EMPLEADOS") && (
              <NavLink to="/empleados" className={navClass} onClick={closeMenu}>
                Empleados
              </NavLink>
            )}
            {can("DISPOSITIVOS") && (
              <NavLink
                to="/dispositivos"
                className={navClass}
                onClick={closeMenu}
              >
                Dispositivos
              </NavLink>
            )}
            {can("USUARIOS") && (
              <NavLink
                to="/usuarios/crear"
                className={navClass}
                onClick={closeMenu}
              >
                Usuarios
              </NavLink>
            )}
            {can("ROLES") && (
              <NavLink to="/roles" className={navClass} onClick={closeMenu}>
                Roles
              </NavLink>
            )}
          </nav>

          {/* User chip */}
          <div className="pg-right">
            <div className="pg-userchip" title={user?.correo || ""}>
              <div className="pg-user-avatar">
                {(user?.usuario || "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="pg-user-text">
                <div className="pg-user-name">{user?.usuario}</div>
                <div className="pg-user-role">{user?.rol}</div>
              </div>
            </div>
            <button className="pg-btn-danger" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="pg-main">
        <div className="pg-container">
          <Outlet />
        </div>
      </main>

      {/* MODAL Confirmación cerrar sesión */}
      <div
        className={`pg-modal ${confirmOpen ? "pg-show" : ""}`}
        aria-hidden={!confirmOpen}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target.classList.contains("pg-modal")) cancelLogout();
        }}
      >
        <div className="pg-modal-card" role="document">
          <div className="pg-modal-head">
            <div className="pg-modal-icon">!</div>
            <div className="pg-modal-title">Cerrar sesión</div>
          </div>
          <div className="pg-modal-body">
            ¿Seguro que deseas cerrar tu sesión?
          </div>
          <div className="pg-modal-actions">
            <button className="pg-btn-outline" onClick={cancelLogout}>
              Cancelar
            </button>
            <button className="pg-btn-danger" onClick={confirmLogout}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      {/* Chatbot flotante */}
      <ChatWidget />

      {/* Scoped styles (idénticos a los tuyos) */}
      <style>{`
        :root{
          --pg-bg:#0b1220;
          --pg-card:#ffffff;
          --pg-ink:#0f172a;
          --pg-ink-2:#475569;
          --pg-border:#e5e7eb;
          --pg-brand:#6366f1;
          --pg-accent:#10b981;
          --pg-pill:#f1f5f9;
        }
        *{box-sizing:border-box}
        .pg-app{min-height:100dvh;background:#f8fafc;color:var(--pg-ink)}
        .pg-container{max-width:1200px;margin:0 auto;padding:0 16px}

        .pg-topbar{
          position:sticky;top:0;z-index:40;
          backdrop-filter:saturate(140%) blur(8px);
          background:linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.75));
          border-bottom:1px solid var(--pg-border);
          box-shadow:0 8px 24px rgba(11,18,32,.05);
        }
        .pg-topbar-inner{display:flex;align-items:center;gap:12px;padding:10px 0;}

        .pg-brand{display:flex;align-items:center;gap:10px}
        .pg-logo{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-weight:900;color:white;background:linear-gradient(135deg,var(--pg-brand),var(--pg-accent));box-shadow:0 6px 14px rgba(99,102,241,.25);}
        .pg-title-main{font-weight:900;line-height:1}
        .pg-title-sub{font-size:12px;line-height:1;color:var(--pg-ink-2)}

        .pg-burger{display:none;margin-left:6px;background:transparent;border:none;padding:6px 4px}
        .pg-burger span{display:block;width:22px;height:2px;background:var(--pg-ink);margin:4px 0;border-radius:2px}

        .pg-nav{display:flex;gap:8px;flex-wrap:wrap;margin-left:24px}
        .pg-navlink{text-decoration:none;color:var(--pg-ink);padding:8px 12px;border-radius:999px;background:var(--pg-pill);border:1px solid transparent;transition:.18s ease;font-weight:600;font-size:14px;}
        .pg-navlink:hover{transform:translateY(-1px);box-shadow:0 8px 16px rgba(11,18,32,.06)}
        .pg-navlink.pg-active{color:#fff;background:linear-gradient(135deg,var(--pg-brand),var(--pg-accent));border-color:transparent;}

        .pg-right{margin-left:auto;display:flex;align-items:center;gap:10px}
        .pg-userchip{display:flex;align-items:center;gap:10px;padding:4px 6px;border-radius:10px;}
        .pg-user-avatar{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--pg-brand),#7c3aed);}
        .pg-user-text{line-height:1}
        .pg-user-name{font-weight:800;font-size:13px}
        .pg-user-role{font-size:11px;color:var(--pg-ink-2)}

        .pg-btn-danger{padding:8px 12px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#dc2626);border:1px solid #dc2626;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 10px 18px rgba(239,68,68,.18);transition:.15s ease;}
        .pg-btn-danger:hover{transform:translateY(-1px);box-shadow:0 12px 22px rgba(239,68,68,.26)}
        .pg-btn-outline{padding:8px 12px;border-radius:10px;background:#fff;border:1px solid var(--pg-border);font-weight:700;cursor:pointer;transition:.15s ease;}
        .pg-btn-outline:hover{transform:translateY(-1px);box-shadow:0 8px 16px rgba(11,18,32,.08)}

        .pg-main{padding:22px 0}

        .pg-modal{position:fixed;inset:0;z-index:60;display:none;place-items:center;background:rgba(2,6,23,.55);backdrop-filter:saturate(140%) blur(6px);padding:16px;}
        .pg-modal.pg-show{display:grid;animation:pgFade .15s ease}
        @keyframes pgFade{from{opacity:.3;transform:scale(.99)}to{opacity:1;transform:scale(1)}}
        .pg-modal-card{width:min(520px,92vw);background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(2,6,23,.35);overflow:hidden;}
        .pg-modal-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--pg-border);}
        .pg-modal-icon{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-weight:900;color:#fff;background:linear-gradient(135deg,#f59e0b,#ef4444);}
        .pg-modal-title{font-weight:900}
        .pg-modal-body{padding:14px 16px;color:var(--pg-ink-2)}
        .pg-modal-actions{padding:14px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--pg-border);}

        @media (max-width: 980px){
          .pg-nav{display:none;position:absolute;left:0;right:0;top:58px;background:#fff;border-bottom:1px solid var(--pg-border);padding:10px 16px;gap:6px;}
          .pg-nav.pg-open{display:flex;flex-wrap:wrap}
          .pg-burger{display:block}
        }
      `}</style>
    </div>
  );
}
