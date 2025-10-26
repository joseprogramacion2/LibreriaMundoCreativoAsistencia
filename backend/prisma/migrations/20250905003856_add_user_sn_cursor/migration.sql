-- AlterTable
ALTER TABLE "public"."AsistenciaEvento" ADD COLUMN     "deviceUserSn" INTEGER;

-- AlterTable
ALTER TABLE "public"."Dispositivo" ADD COLUMN     "ultimoUserSn" INTEGER NOT NULL DEFAULT 0;
