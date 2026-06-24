-- Idempotent migration for Medicine Master fields
-- Safe to run multiple times
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "MedicineType" AS ENUM (
    'TABLET',
    'CAPSULE',
    'SYRUP',
    'SUSPENSION',
    'INJECTION',
    'DROPS',
    'CREAM',
    'GEL',
    'OINTMENT',
    'POWDER',
    'INHALER',
    'SPRAY',
    'MEDICAL_DEVICE'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "ScheduleType" AS ENUM ('OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "PurchaseUnit" AS ENUM ('BOX', 'CARTON', 'BOTTLE', 'TUBE', 'PIECE');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "SellingUnit" AS ENUM (
    'TABLET',
    'CAPSULE',
    'STRIP',
    'BOTTLE',
    'TUBE',
    'PIECE',
    'VIAL'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- AlterTable - Add new columns to Medicine table (idempotent)
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "medicineName" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "brandName" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "manufacturerName" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "medicineType" "MedicineType";
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "schedule" "ScheduleType";
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "purchaseUnit" "PurchaseUnit";
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "sellingUnit" "SellingUnit";
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "unitPerPack" INTEGER;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "requiresPrescription" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "Medicine"
ADD COLUMN "notes" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
-- Update existing records to populate medicineName from name
UPDATE "Medicine"
SET "medicineName" = "name"
WHERE "medicineName" IS NULL;
-- Update existing records to populate requiresPrescription from prescriptionRequired
UPDATE "Medicine"
SET "requiresPrescription" = "prescriptionRequired"
WHERE "requiresPrescription" = false
    AND "prescriptionRequired" = true;
-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "idx_medicine_medicineType" ON "Medicine"("medicineType");
CREATE INDEX IF NOT EXISTS "idx_medicine_schedule" ON "Medicine"("schedule");