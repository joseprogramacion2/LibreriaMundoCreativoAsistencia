// frontend/src/components/RequirePerm.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getAuth } from '../utils/auth';

export default function RequirePerm({ anyOf = [] }) {
  const loc = useLocation();
  const { user } = getAuth();
  const needed = Array.isArray(anyOf) ? anyOf : [anyOf];

  const set = new Set((user?.permisos || []).map(String));
  const hasStar = set.has('*');
  const ok = hasStar || needed.length === 0 || needed.some((p) => set.has(p));

  if (!ok) return <Navigate to="/panel" state={{ from: loc }} replace />;
  return <Outlet />;
}
