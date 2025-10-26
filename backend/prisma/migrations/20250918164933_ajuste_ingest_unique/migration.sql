/*
  Warnings:

  - A unique constraint covering the columns `[dispositivoId,deviceUnix]` on the table `AsistenciaEvento` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."AsistenciaEvento_dispositivoId_deviceUserSn_key";

-- DropIndex
DROP INDEX "public"."AsistenciaEvento_empleadoId_dispositivoId_deviceUnix_key";

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaEvento_dispositivoId_deviceUnix_key" ON "public"."AsistenciaEvento"("dispositivoId", "deviceUnix");
