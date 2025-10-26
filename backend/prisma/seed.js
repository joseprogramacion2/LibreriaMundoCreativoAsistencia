// prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ===== Roles base =====
  const superRol = await prisma.rol.upsert({
    where: { nombre: 'Super Admin' },
    update: { permisos: ['*'] },
    create: { nombre: 'Super Admin', permisos: ['*'] },
  });

  // Admin por defecto (tú puedes ampliarlo luego desde /roles)
  const adminPerms = [
    'DASHBOARD',
    'ASISTENCIA_DIARIA',
    'ASISTENCIA_HISTORIAL',
    'EMPLEADOS',
    // Si quieres que admin vea estas, descomenta:
    // 'SUCURSALES',
    // 'DISPOSITIVOS',
    // 'USUARIOS',
    // 'ROLES',
  ];

  const adminRol = await prisma.rol.upsert({
    where: { nombre: 'Administrador' },
    update: { permisos: adminPerms },
    create: { nombre: 'Administrador', permisos: adminPerms },
  });

  // ===== Usuarios demo =====
  const superHash = await bcrypt.hash('super123', 10);
  await prisma.usuario.upsert({
    where: { usuario: 'superadmin' },
    update: {
      nombre: 'Super Admin',
      correo: 'super@mc.com',
      hash: superHash,
      rolId: superRol.id,
      activo: true,
      debeCambiarPass: false,
    },
    create: {
      nombre: 'Super Admin',
      usuario: 'superadmin',
      correo: 'super@mc.com',
      hash: superHash,
      rolId: superRol.id,
      activo: true,
      debeCambiarPass: false,
    },
  });

  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {
      nombre: 'Admin',
      correo: 'admin@mc.com',
      hash: adminHash,
      rolId: adminRol.id,
      activo: true,
      debeCambiarPass: true,
    },
    create: {
      nombre: 'Admin',
      usuario: 'admin',
      correo: 'admin@mc.com',
      hash: adminHash,
      rolId: adminRol.id,
      activo: true,
      debeCambiarPass: true,
    },
  });

  console.log('✅ Seed listo:');
  console.log('  SuperAdmin => superadmin / super123');
  console.log('  Administrador => admin / admin123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
