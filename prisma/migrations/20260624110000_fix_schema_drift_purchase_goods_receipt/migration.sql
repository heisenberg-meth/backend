-- Fix schema drift: Production database missing columns that exist in Prisma schema
-- PurchaseOrder.acknowledgedAt was never migrated (migration only added it to ExpiryAlert)
-- PurchaseOrder.sentAt was never migrated
-- GoodsReceiptNote.reversedAt/reversedBy/reversalReason were never migrated

-- 1. PurchaseOrder: add acknowledgedAt if missing
DO $$ BEGIN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 2. PurchaseOrder: add sentAt if missing
DO $$ BEGIN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "sentAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 3. GoodsReceiptNote: add reversedAt if missing
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversedAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 4. GoodsReceiptNote: add reversedBy if missing
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversedBy" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- 5. GoodsReceiptNote: add reversalReason if missing
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversalReason" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
