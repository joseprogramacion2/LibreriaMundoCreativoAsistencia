// src/db/prisma.js
import { PrismaClient } from "@prisma/client";

/**
 * ÚNICA instancia de Prisma para toda la app.
 * En desarrollo se reutiliza para evitar abrir pools extra con nodemon.
 */
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
