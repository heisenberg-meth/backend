-- Fix: Add missing "notes" column to Supplier table
-- Root cause: schema.prisma has notes String? but production DB never received this column
-- This fixes Prisma P2022: "The column Supplier.notes does not exist in the current database."
ALTER TABLE "Supplier"
ADD COLUMN IF NOT EXISTS "notes" TEXT;