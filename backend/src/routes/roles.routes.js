import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import requireAuth from '../middlewares/requireAuth.js';
import requirePerm from '../middlewares/requirePerm.js';
import { PERM_CATALOG, isValidPerm } from '../utils/permCatalog.js';

const prisma = new PrismaClient();
const router = Router();

/* ===== helper: detectar rol Super Admin bloqueado ===== */
async function isLockedSuperAdmin(id) {
  const r = await prisma.rol.findUnique({ where: { id: Number(id) } });
  if (!r) return false;
  return String(r.nombre || "").trim().toLowerCase() === "super admin";
}

/** Listar roles (resumen) */
router.get('/', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (_req, res) => {
  const roles = await prisma.rol.findMany({
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, permisos: true, _count: { select: { usuarios: true } } },
  });
  res.json(roles);
});

/** Obtener un rol con sus permisos */
router.get('/:id', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  const rol = await prisma.rol.findUnique({
    where: { id },
    select: { id: true, nombre: true, permisos: true },
  });
  if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
  res.json(rol);
});

/** Crear rol */
router.post('/', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const { nombre } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

  const exists = await prisma.rol.findUnique({ where: { nombre } });
  if (exists) return res.status(409).json({ error: 'Ya existe un rol con ese nombre' });

  const r = await prisma.rol.create({ data: { nombre, permisos: [] } });
  res.json(r);
});

/** Renombrar rol */
router.put('/:id', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  if (await isLockedSuperAdmin(id)) {
    return res.status(403).json({ error: 'Rol Super Admin está bloqueado y no puede renombrarse.' });
  }
  const { nombre } = req.body || {};
  if (!nombre?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const r = await prisma.rol.update({ where: { id }, data: { nombre } });
  res.json(r);
});

/** Reemplazar permisos del rol con una lista explícita */
router.put('/:id/permisos', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  if (await isLockedSuperAdmin(id)) {
    return res.status(403).json({ error: 'No se pueden modificar permisos del rol Super Admin.' });
  }
  let { permisos } = req.body || {};
  if (!Array.isArray(permisos)) permisos = [];
  const clean = Array.from(new Set(permisos.map(String).filter(isValidPerm)));
  const r = await prisma.rol.update({ where: { id }, data: { permisos: clean } });
  res.json(r);
});

/** Acceso total con comodín '*' (ON/OFF) */
router.post('/:id/access-all', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  if (await isLockedSuperAdmin(id)) {
    return res.status(403).json({ error: 'Super Admin ya posee acceso total y no es editable.' });
  }
  const { enabled } = req.body || {};
  const nuevos = enabled ? ['*'] : [];
  const r = await prisma.rol.update({ where: { id }, data: { permisos: nuevos } });
  res.json(r);
});

/** Seleccionar todo el catálogo (sin usar '*') */
router.post('/:id/grant-all', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  if (await isLockedSuperAdmin(id)) {
    return res.status(403).json({ error: 'No es necesario aplicar catálogo al Super Admin.' });
  }
  const r = await prisma.rol.update({ where: { id }, data: { permisos: PERM_CATALOG } });
  res.json(r);
});

/** (Opcional) Eliminar rol — también bloqueado para Super Admin */
router.delete('/:id', requireAuth, requirePerm(['ROLES_GESTIONAR']), async (req, res) => {
  const id = Number(req.params.id);
  if (await isLockedSuperAdmin(id)) {
    return res.status(403).json({ error: 'No se puede eliminar el rol Super Admin.' });
  }
  await prisma.rol.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
