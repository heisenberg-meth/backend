-- CreateEnum
CREATE TYPE "MedicineType" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'DROPS', 'CREAM', 'GEL', 'OINTMENT', 'POWDER', 'INHALER', 'SPRAY', 'MEDICAL_DEVICE');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('OTC', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X');

-- CreateEnum
CREATE TYPE "PurchaseUnit" AS ENUM ('BOX', 'CARTON', 'BOTTLE', 'TUBE', 'PIECE');

-- CreateEnum
CREATE TYPE "SellingUnit" AS ENUM ('TABLET', 'CAPSULE', 'STRIP', 'BOTTLE', 'TUBE', 'PIECE', 'VIAL');

-- AlterTable - Add new columns to Medicine table (nullable first for existing data)
ALTER TABLE "Medicine" ADD COLUMN "medicineName" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "brandName" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "manufacturerName" TEXT;
ALTER TABLE "Medicine" ADD COLUMN "medicineType" "MedicineType";
ALTER TABLE "Medicine" ADD COLUMN "schedule" "ScheduleType";
ALTER TABLE "Medicine" ADD COLUMN "purchaseUnit" "PurchaseUnit";
ALTER TABLE "Medicine" ADD COLUMN "sellingUnit" "SellingUnit";
ALTER TABLE "Medicine" ADD COLUMN "unitPerPack" INTEGER;
ALTER TABLE "Medicine" ADD COLUMN "requiresPrescription" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Medicine" ADD COLUMN "notes" TEXT;

-- Update existing records to populate medicineName from name
UPDATE "Medicine" SET "medicineName" = "name" WHERE "medicineName" IS NULL;

-- Update existing records to populate requiresPrescription from prescriptionRequired
UPDATE "Medicine" SET "requiresPrescription" = "prescriptionRequired" WHERE "requiresPrescription" = false AND "prescriptionRequired" = true;

-- CreateIndex
CREATE INDEX "idx_medicine_medicineType" ON "Medicine"("medicineType");
CREATE INDEX "idx_medicine_schedule" ON "Medicine"("schedule");
