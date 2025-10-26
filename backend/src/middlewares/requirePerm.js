// backend/src/middlewares/requirePerm.js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * requirePerm(['ASISTENCIA_VER','USUARIOS_CRUD'])
 * Autoriza si el usuario tiene AL MENOS uno de los permisos.
 * Soporta comodín '*' en Rol.permisos (acceso total).
 */
export default function requirePerm(anyOf = []) {
  const needed = Array.isArray(anyOf) ? anyOf : [anyOf];

  return async (req, res, next) => {
    try {
      const u = req.user; // viene desde requireAuth
      if (!u?.id) return res.status(401).json({ error: 'No autenticado' });

      // 1) Intentar leer permisos desde el token (mejor performance)
      let perms = Array.isArray(u.permisos) ? u.permisos : null;

      // 2) Si el token no traía permisos, leer de BD
      if (!perms) {
        const dbUser = await prisma.usuario.findUnique({
          where: { id: u.id },
          select: { rol: { select: { permisos: true } } },
        });
        perms = dbUser?.rol?.permisos || [];
      }

      // 3) Super acceso
      if (perms.includes('*')) return next();

      // 4) Si no se pidió ningún permiso concreto, basta estar logueado
      if (!needed.length) return next();

      // 5) ¿Tiene alguno?
      const ok = needed.some((p) => perms.includes(p));
      if (!ok) {
        return res.status(403).json({ error: 'Permiso insuficiente', need: needed });
      }

      next();
    } catch (e) {
      console.error('[requirePerm]', e);
      return res.status(500).json({ error: 'Error de permisos' });
    }
  };
}
