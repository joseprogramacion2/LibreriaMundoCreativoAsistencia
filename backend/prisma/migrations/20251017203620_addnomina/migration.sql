/*
  Warnings:

  - You are about to alter the column `horasTrabajadas` on the `NominaItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(6,2)`.

*/
-- CreateEnum
CREATE TYPE "public"."PagoTipo" AS ENUM ('POR_HORA', 'POR_MES');

-- AlterTable
ALTER TABLE "public"."Empleado" ADD COLUMN     "pagoTipo" "public"."PagoTipo" NOT NULL DEFAULT 'POR_MES',
ADD COLUMN     "salarioMensual" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "public"."NominaItem" ADD COLUMN     "bonos" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "descuentos" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "horasMeta" DECIMAL(6,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "sueldoBase" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "tarifaHora" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ALTER COLUMN "horasTrabajadas" SET DEFAULT 0.00,
ALTER COLUMN "horasTrabajadas" SET DATA TYPE DECIMAL(6,2);

-- AlterTable
ALTER TABLE "public"."PeriodoNomina" ADD COLUMN     "horasMeta" DECIMAL(6,2) NOT NULL DEFAULT 160.00;
