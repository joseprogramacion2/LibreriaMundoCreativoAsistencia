import axios from 'axios';

// Usa variable de entorno Vite
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

export const http = axios.create({
  baseURL: API_BASE,
});

export function setAuthToken(token) {
  if (token) {
    http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete http.defaults.headers.common['Authorization'];
  }
}
