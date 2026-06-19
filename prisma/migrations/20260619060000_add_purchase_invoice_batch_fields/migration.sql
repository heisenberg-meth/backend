-- AlterTable
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "purchaseInvoiceNumber" VARCHAR(100);
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3);
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "receivedDate" TIMESTAMP(3);
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "manufacturerName" VARCHAR(255);