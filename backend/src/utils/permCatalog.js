// backend/src/utils/permCatalog.js
// Solo títulos de vistas del Layout (tu menú):
export const PERM_CATALOG = [
  'DASHBOARD',              // /panel (opcional: suele dejarse libre, pero lo incluimos)
  'ASISTENCIA_DIARIA',      // /asistencia/diaria
  'ASISTENCIA_HISTORIAL',   // /asistencia/historial
  'SUCURSALES',             // /sucursales
  'EMPLEADOS',              // /empleados (incluye turnos, etc. dentro)
  'DISPOSITIVOS',           // /dispositivos
  'USUARIOS',               // /usuarios/crear
  'ROLES',                  // /roles (gestión de roles)
];

export function isValidPerm(p) {
  return PERM_CATALOG.includes(p);
}
