// backend/src/middlewares/requireAuth.js
import jwt from 'jsonwebtoken';

export default function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const tok = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!tok) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(tok, process.env.JWT_SECRET || 'secret123');
    req.user = payload; // { id, rol, mustChange }
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}
