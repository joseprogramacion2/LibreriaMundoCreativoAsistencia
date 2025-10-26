/*
  Warnings:

  - A unique constraint covering the columns `[empleadoId,dispositivoId,deviceUnix]` on the table `AsistenciaEvento` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[dispositivoId,deviceUserSn]` on the table `AsistenciaEvento` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "AsistenciaEvento_dispositivoId_deviceUserSn_idx" ON "public"."AsistenciaEvento"("dispositivoId", "deviceUserSn");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaEvento_empleadoId_dispositivoId_deviceUnix_key" ON "public"."AsistenciaEvento"("empleadoId", "dispositivoId", "deviceUnix");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaEvento_dispositivoId_deviceUserSn_key" ON "public"."AsistenciaEvento"("dispositivoId", "deviceUserSn");
