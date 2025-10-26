// backend/src/routes/permisos.routes.js
import { Router } from 'express';
import requireAuth from '../middlewares/requireAuth.js';
import requirePerm from '../middlewares/requirePerm.js';
import { PERM_CATALOG } from '../utils/permCatalog.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  requirePerm(['ROLES_GESTIONAR']),
  (_req, res) => res.json(PERM_CATALOG)
);

export default router;
