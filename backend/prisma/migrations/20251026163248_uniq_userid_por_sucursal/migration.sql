/*
  Warnings:

  - A unique constraint covering the columns `[sucursalId,userIdDispositivo]` on the table `Empleado` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "uniq_userid_por_sucursal" ON "public"."Empleado"("sucursalId", "userIdDispositivo");
