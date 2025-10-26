// backend/src/utils/password.js
import bcrypt from 'bcryptjs';

export const POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function validatePolicy(pass) {
  return POLICY_REGEX.test(String(pass || ''));
}

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function genTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*()-_=+';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  if (!/[A-Z]/.test(out)) out = 'A' + out.slice(1);
  if (!/\d/.test(out)) out = out.slice(0, 1) + '7' + out.slice(2);
  if (!/[^A-Za-z0-9]/.test(out)) out = out.slice(0, 2) + '!' + out.slice(3);
  return out;
}
