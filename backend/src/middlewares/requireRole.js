// backend/src/middlewares/requireRole.js
export default function requireRole(...roles) {
  return (req, res, next) => {
    const rol = req.user?.rol;
    if (!rol) return res.status(403).json({ error: 'Sin rol' });
    if (!roles.includes(rol)) return res.status(403).json({ error: 'Permiso denegado' });
    next();
  };
}
