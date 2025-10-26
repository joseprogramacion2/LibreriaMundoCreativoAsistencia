-- CreateEnum
CREATE TYPE "public"."EventoTipo" AS ENUM ('FICHAJE');

-- CreateTable
CREATE TABLE "public"."Sucursal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Dispositivo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "puerto" INTEGER NOT NULL DEFAULT 4370,
    "numeroSerie" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "sucursalId" INTEGER NOT NULL,
    "ultimoEventoUnix" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Empleado" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "dpi" TEXT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "sucursalId" INTEGER NOT NULL,
    "userIdDispositivo" INTEGER,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Turno" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "horaEntrada" TEXT NOT NULL,
    "horaSalida" TEXT NOT NULL,
    "toleranciaMinutos" INTEGER NOT NULL DEFAULT 5,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TurnoAsignado" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3),

    CONSTRAINT "TurnoAsignado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AsistenciaEvento" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "dispositivoId" INTEGER NOT NULL,
    "tipo" "public"."EventoTipo" NOT NULL DEFAULT 'FICHAJE',
    "deviceUnix" INTEGER NOT NULL,
    "timestampUTC" TIMESTAMP(3) NOT NULL,
    "crudo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsistenciaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "rolId" INTEGER NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Rol" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "permisos" TEXT[],

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PeriodoNomina" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NominaItem" (
    "id" SERIAL NOT NULL,
    "empleadoId" INTEGER NOT NULL,
    "periodoId" INTEGER NOT NULL,
    "horasTrabajadas" INTEGER NOT NULL DEFAULT 0,
    "llegadasTarde" INTEGER NOT NULL DEFAULT 0,
    "salidasTemprano" INTEGER NOT NULL DEFAULT 0,
    "inasistencias" INTEGER NOT NULL DEFAULT 0,
    "pagoCalculado" DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "NominaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispositivo_numeroSerie_key" ON "public"."Dispositivo"("numeroSerie");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_codigo_key" ON "public"."Empleado"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_dpi_key" ON "public"."Empleado"("dpi");

-- CreateIndex
CREATE INDEX "AsistenciaEvento_empleadoId_timestampUTC_idx" ON "public"."AsistenciaEvento"("empleadoId", "timestampUTC");

-- CreateIndex
CREATE INDEX "AsistenciaEvento_dispositivoId_deviceUnix_idx" ON "public"."AsistenciaEvento"("dispositivoId", "deviceUnix");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "public"."Usuario"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "public"."Usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "public"."Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "NominaItem_empleadoId_periodoId_key" ON "public"."NominaItem"("empleadoId", "periodoId");

-- AddForeignKey
ALTER TABLE "public"."Dispositivo" ADD CONSTRAINT "Dispositivo_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "public"."Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Empleado" ADD CONSTRAINT "Empleado_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "public"."Sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TurnoAsignado" ADD CONSTRAINT "TurnoAsignado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "public"."Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TurnoAsignado" ADD CONSTRAINT "TurnoAsignado_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "public"."Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AsistenciaEvento" ADD CONSTRAINT "AsistenciaEvento_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "public"."Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AsistenciaEvento" ADD CONSTRAINT "AsistenciaEvento_dispositivoId_fkey" FOREIGN KEY ("dispositivoId") REFERENCES "public"."Dispositivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "public"."Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NominaItem" ADD CONSTRAINT "NominaItem_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "public"."Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NominaItem" ADD CONSTRAINT "NominaItem_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "public"."PeriodoNomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
