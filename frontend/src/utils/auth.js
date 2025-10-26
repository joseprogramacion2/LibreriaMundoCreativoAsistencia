// src/utils/auth.js
export const AUTH_KEYS = { token: 'token', user: 'user', remember: 'remember' };

export function setAuth({ token, user, remember }) {
  // guarda preferencia para el próximo inicio
  localStorage.setItem(AUTH_KEYS.remember, String(!!remember));

  const s = remember ? localStorage : sessionStorage;
  s.setItem(AUTH_KEYS.token, token);
  s.setItem(AUTH_KEYS.user, JSON.stringify(user));

  // limpia el otro storage para evitar duplicados/confusión
  const other = remember ? sessionStorage : localStorage;
  other.removeItem(AUTH_KEYS.token);
  other.removeItem(AUTH_KEYS.user);
}

export function getAuth() {
  const token =
    localStorage.getItem(AUTH_KEYS.token) ||
    sessionStorage.getItem(AUTH_KEYS.token) ||
    null;

  const rawUser =
    localStorage.getItem(AUTH_KEYS.user) ||
    sessionStorage.getItem(AUTH_KEYS.user) ||
    null;

  const user = rawUser ? safeParse(rawUser) : null;

  const rememberPref = localStorage.getItem(AUTH_KEYS.remember);
  const remember = rememberPref === null ? true : rememberPref === 'true';

  return { token, user, remember };
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEYS.token);
  localStorage.removeItem(AUTH_KEYS.user);
  sessionStorage.removeItem(AUTH_KEYS.token);
  sessionStorage.removeItem(AUTH_KEYS.user);
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
