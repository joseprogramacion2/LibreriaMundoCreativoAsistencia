// frontend/src/utils/api.js
import axios from 'axios';

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001';

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

// ====== Auth helpers (token en localStorage) ======
export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token);
    http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('token');
    delete http.defaults.headers.common['Authorization'];
  }
}

// asegúrate de poner el header si ya había token al recargar
export function ensureTokenHeader() {
  const t = localStorage.getItem('token');
  if (t) http.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  return t;
}
ensureTokenHeader();

// API de autenticación
export const AuthApi = {
  login: (usuario, password) => http.post('/auth/login', { usuario, password }),
  changePassword: (oldPassword, newPassword, confirmPassword) =>
    http.post('/auth/change-password', { oldPassword, newPassword, confirmPassword }),
  getRoles: () => http.get('/auth/roles'),
  createUser: (payload) => http.post('/auth/create-user', payload),
};
