// backend/src/routes/auth.routes.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { sendEmail } from '../services/email.js';   // <-- usamos el servicio central

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secret123';

/* ========================= Helpers ========================= */

function getTokenPayload(req) {
  const header = req.headers.authorization || '';
  const tok = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!tok) return null;
  try { return jwt.verify(tok, JWT_SECRET); } catch { return null; }
}

async function authGuard(req, res, next) {
  const payload = getTokenPayload(req);
  if (!payload?.id) return res.status(401).json({ error: 'Token requerido' });

  const user = await prisma.usuario.findUnique({
    where: { id: payload.id },
    include: { rol: true },
  });
  if (!user || !user.activo) return res.status(401).json({ error: 'Sesión inválida' });

  req.user = {
    id: user.id,
    rol: user.rol?.nombre ?? null,
    permisos: Array.isArray(user.rol?.permisos) ? user.rol.permisos : [],
    mustChange: Boolean(user.debeCambiarPass),
    activo: Boolean(user.activo),
  };
  req._userRow = user;
  next();
}

function roleGuard(...roles) {
  return (req, res, next) => {
    if (!req.user?.rol) return res.status(403).json({ error: 'Sin rol' });
    if (!roles.includes(req.user.rol)) return res.status(403).json({ error: 'Permiso denegado' });
    next();
  };
}

function ensurePasswordChanged(req, res, next) {
  if (req.user?.mustChange) {
    return res.status(428).json({ error: 'Debe cambiar su contraseña' });
  }
  next();
}

const POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
function validatePolicy(pass) { return POLICY_REGEX.test(String(pass || '')); }

function genTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()-_=+';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  if (!/[A-Z]/.test(out)) out = 'A' + out.slice(1);
  if (!/\d/.test(out)) out = out.slice(0, 1) + '7' + out.slice(2);
  if (!/[^A-Za-z0-9]/.test(out)) out = out.slice(0, 2) + '!' + out.slice(3);
  return out;
}

/* ============================== Rutas Auth ============================== */

router.post('/login', async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim();
  const password = String(req.body?.password || '');

  try {
    const user = await prisma.usuario.findFirst({
      where: { OR: [{ usuario }, { correo: usuario }] },
      include: { rol: true },
    });
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario o contraseña inválidos' });
    }

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña inválidos' });

    const permisos = Array.isArray(user.rol?.permisos) ? user.rol.permisos : [];

    const payload = {
      id: user.id,
      rol: user.rol?.nombre ?? null,
      permisos,
      mustChange: Boolean(user.debeCambiarPass),
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      token,
      user: {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        rol: payload.rol,
        permisos,
      },
      mustChange: payload.mustChange,
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/me', authGuard, async (req, res) => {
  const u = req._userRow;
  return res.json({
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol?.nombre ?? null,
    permisos: Array.isArray(u.rol?.permisos) ? u.rol.permisos : [],
    mustChange: Boolean(u.debeCambiarPass),
  });
});

/* ====== CAMBIAR CONTRASEÑA (con historial) ====== */
router.post('/change-password', authGuard, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body || {};
    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'La confirmación no coincide' });
    }
    if (!validatePolicy(newPassword)) {
      return res.status(400).json({
        error: 'La contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 número y 1 carácter especial',
      });
    }

    const user = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(oldPassword, user.hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const last = await prisma.passwordHistory.findMany({
      where: { usuarioId: user.id },
      orderBy: { creadoEn: 'desc' },
      take: 5,
      select: { hash: true },
    });

    if (await bcrypt.compare(newPassword, user.hash)) {
      return res.status(400).json({ error: 'No puedes reutilizar tu contraseña actual.' });
    }
    for (const h of last) {
      if (await bcrypt.compare(newPassword, h.hash)) {
        return res.status(400).json({ error: 'No puedes reutilizar ninguna de tus últimas 5 contraseñas.' });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: user.id },
        data: { hash: newHash, debeCambiarPass: false },
      });
      await tx.passwordHistory.create({
        data: { usuarioId: user.id, hash: newHash },
      });
      const extra = await tx.passwordHistory.findMany({
        where: { usuarioId: user.id },
        orderBy: { creadoEn: 'desc' },
        skip: 5,
        select: { id: true },
      });
      if (extra.length) {
        await tx.passwordHistory.deleteMany({ where: { id: { in: extra.map(e => e.id) } } });
      }
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

/* ======================= Administración de usuarios ======================= */

router.get('/roles',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'),
  async (_req, res) => {
    const roles = await prisma.rol.findMany({ orderBy: { nombre: 'asc' } });
    res.json(roles);
  }
);

router.post('/create-user',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'),
  async (req, res) => {
    try {
      const { nombre, usuario, correo, rolId } = req.body || {};
      if (!nombre || !usuario || !correo || !rolId) {
        return res.status(400).json({ error: 'Faltan datos' });
      }

      const temp = genTempPassword();
      const hash = await bcrypt.hash(temp, 10);

      const created = await prisma.$transaction(async (tx) => {
        const u = await tx.usuario.create({
          data: {
            nombre, usuario, correo,
            hash,
            rolId: Number(rolId),
            activo: true,
            debeCambiarPass: true,
          },
          include: { rol: true },
        });
        await tx.passwordHistory.create({ data: { usuarioId: u.id, hash } });
        return u;
      });

      const html = `
        <h2>Tu cuenta fue creada</h2>
        <p><b>Usuario:</b> ${created.usuario}</p>
        <p><b>Contraseña temporal:</b> ${temp}</p>
        <p>Inicia sesión y cambia tu contraseña de inmediato.</p>
      `;
      let emailSent = false;
      try {
        await sendEmail(created.correo, 'Tu cuenta en el Sistema de Asistencia', html);
        emailSent = true;
      } catch (e) {
        console.error('[create-user][email] ❌', e?.message || e);
      }

      return res.status(201).json({
        id: created.id,
        nombre: created.nombre,
        usuario: created.usuario,
        correo: created.correo,
        rol: created.rol?.nombre,
        emailSent,
      });
    } catch (e) {
      if (String(e.message).includes('Unique')) {
        return res.status(409).json({ error: 'Usuario o correo ya usado' });
      }
      console.error(e);
      return res.status(500).json({ error: 'Error creando usuario' });
    }
  }
);

router.get('/users',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'),
  async (req, res) => {
    const { q = '', page = '1', size = '10' } = req.query;
    const take = Math.max(1, Math.min(100, parseInt(size)));
    const skip = (Math.max(1, parseInt(page)) - 1) * take;

    const where = q
      ? {
          OR: [
            { usuario: { contains: String(q), mode: 'insensitive' } },
            { nombre:  { contains: String(q), mode: 'insensitive' } },
            { correo:  { contains: String(q), mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.usuario.findMany({
        where, skip, take,
        include: { rol: true },
        orderBy: { creadoEn: 'desc' },
      }),
      prisma.usuario.count({ where }),
    ]);

    res.json({
      items: items.map(u => ({
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,
        correo: u.correo,
        rol: u.rol?.nombre,
        rolId: u.rolId,
        activo: u.activo,
        debeCambiarPass: Boolean(u.debeCambiarPass),
        creadoEn: u.creadoEn,
      })),
      total, page: Number(page), size: take,
    });
  }
);

/* ===== Bloquea edición / activación del Super Admin ===== */
async function assertNotSuperAdminTarget(id, actionName, res) {
  const target = await prisma.usuario.findUnique({
    where: { id },
    include: { rol: true },
  });
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return null;
  }
  if (target.rol?.nombre === 'Super Admin') {
    res.status(403).json({ error: `No se puede ${actionName} al Super Admin` });
    return null;
  }
  return target;
}

router.patch('/users/:id',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'), // <-- quitado el espacio accidental
  async (req, res) => {
    const id = Number(req.params.id);
    const { nombre, usuario, correo, rolId } = req.body || {};
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const target = await assertNotSuperAdminTarget(id, 'editar', res);
    if (!target) return;

    try {
      const updated = await prisma.usuario.update({
        where: { id },
        data: {
          ...(nombre != null ? { nombre } : {}),
          ...(usuario != null ? { usuario } : {}),
          ...(correo  != null ? { correo }  : {}),
          ...(rolId   != null ? { rolId: Number(rolId) } : {}),
        },
        include: { rol: true },
      });
      res.json({
        id: updated.id,
        usuario: updated.usuario,
        nombre: updated.nombre,
        correo: updated.correo,
        rol: updated.rol?.nombre,
        rolId: updated.rolId,
        activo: updated.activo,
      });
    } catch (e) {
      if (String(e.message).includes('Unique')) {
        return res.status(409).json({ error: 'Usuario o correo ya usado' });
      }
      console.error(e);
      res.status(500).json({ error: 'No se pudo actualizar' });
    }
  }
);

router.patch('/users/:id/status',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'),
  async (req, res) => {
    const id = Number(req.params.id);
    const { activo } = req.body || {};
    if (!id || typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const target = await assertNotSuperAdminTarget(id, 'activar/desactivar', res);
    if (!target) return;

    const updated = await prisma.usuario.update({
      where: { id },
      data: { activo },
      select: { id: true, activo: true },
    });
    res.json(updated);
  }
);

router.post('/users/:id/resend-temp',
  authGuard,
  ensurePasswordChanged,
  roleGuard('Super Admin', 'Administrador'),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const user = await prisma.usuario.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!user.activo) return res.status(400).json({ error: 'Usuario desactivado' });

    const temp = genTempPassword();
    const hash = await bcrypt.hash(temp, 10);

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { hash, debeCambiarPass: true } });
      await tx.passwordHistory.create({ data: { usuarioId: id, hash } });
      const extra = await tx.passwordHistory.findMany({
        where: { usuarioId: id },
        orderBy: { creadoEn: 'desc' },
        skip: 5,
        select: { id: true },
      });
      if (extra.length) {
        await tx.passwordHistory.deleteMany({ where: { id: { in: extra.map(e => e.id) } } });
      }
    });

    const html = `
      <h2>Restablecimiento de contraseña</h2>
      <p><b>Usuario:</b> ${user.usuario}</p>
      <p><b>Contraseña temporal:</b> ${temp}</p>
      <p>Inicia sesión y cambia tu contraseña de inmediato.</p>
    `;
    let emailSent = false;
    try {
      await sendEmail(user.correo, 'Tu nueva contraseña temporal', html);
      emailSent = true;
    } catch (e) {
      console.error('[resend-temp][email] ❌', e?.message || e);
    }

    res.json({ ok: true, emailSent });
  }
);

/* ======== OLVIDÉ MI CONTRASEÑA ======== */
router.post('/forgot-password', async (req, res) => {
  const usuarioOrCorreo =
    String(req.body?.usuarioOrCorreo ?? req.body?.usuario ?? req.body?.correo ?? req.body?.identifier ?? '').trim();

  if (!usuarioOrCorreo) {
    return res.json({ ok: true, requested: false });
  }

  try {
    const user = await prisma.usuario.findFirst({
      where: {
        OR: [
          { usuario: usuarioOrCorreo },
          { correo: usuarioOrCorreo }
        ]
      }
    });

    if (user && user.activo) {
      const temp = genTempPassword();
      const hash = await bcrypt.hash(temp, 10);

      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({
          where: { id: user.id },
          data: { hash, debeCambiarPass: true },
        });
        await tx.passwordHistory.create({ data: { usuarioId: user.id, hash } });

        const extra = await tx.passwordHistory.findMany({
          where: { usuarioId: user.id },
          orderBy: { creadoEn: 'desc' },
          skip: 5,
          select: { id: true },
        });
        if (extra.length) {
          await tx.passwordHistory.deleteMany({ where: { id: { in: extra.map(e => e.id) } } });
        }
      });

      const html = `
        <h2>Restablecimiento de contraseña</h2>
        <p>Se ha generado una <b>contraseña temporal</b> para tu cuenta.</p>
        <p><b>Usuario:</b> ${user.usuario}</p>
        <p><b>Contraseña temporal:</b> ${temp}</p>
        <p>Ingresa al sistema y se te pedirá <b>cambiarla</b> inmediatamente.</p>
      `;
      try {
        await sendEmail(user.correo, 'Restablecimiento de contraseña', html);
      } catch (e) {
        console.error('[forgot-password][email] ❌', e?.message || e);
      }
    }

    return res.json({ ok: true, requested: true });
  } catch (e) {
    console.error('forgot-password error:', e);
    return res.json({ ok: true, requested: true, emailSent: false });
  }
});

export default router;
