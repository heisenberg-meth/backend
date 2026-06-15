-- Add batchNumber and expiryDate fields to PurchaseOrderItem
-- These allow pre-filling the receive modal with data entered during PO creation

ALTER TABLE "PurchaseOrderItem"
ADD COLUMN IF NOT EXISTS "batchNumber" TEXT,
ADD COLUMN IF NOT EXISTS "expiryDate" DATE;
