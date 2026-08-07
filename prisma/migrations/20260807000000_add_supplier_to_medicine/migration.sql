-- AlterTable
ALTER TABLE "Medicine"
ADD "supplierId" TEXT;
ALTER TABLE "Medicine"
ADD CONSTRAINT "Medicine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE
SET NULL ON UPDATE CASCADE;