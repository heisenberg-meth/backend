-- Add drugCategories column to Supplier table
ALTER TABLE "Supplier"
ADD COLUMN "drugCategories" TEXT[] NOT NULL DEFAULT '{}';
