/*
  Warnings:

  - A unique constraint covering the columns `[nombre]` on the table `Turno` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Turno_nombre_key" ON "public"."Turno"("nombre");

-- CreateIndex
CREATE INDEX "TurnoAsignado_empleadoId_desde_idx" ON "public"."TurnoAsignado"("empleadoId", "desde");
