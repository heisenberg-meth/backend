-- ============================================================
-- EMERGENCY FIX: Schema Drift for Purchase Orders & Invoices
-- Run this directly against production database
-- All statements are idempotent (safe to run multiple times)
-- ============================================================

-- Fix 1: PurchaseOrder.acknowledgedAt
DO $$ BEGIN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Fix 2: PurchaseOrder.sentAt
DO $$ BEGIN
    ALTER TABLE "PurchaseOrder" ADD COLUMN "sentAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Fix 3: GoodsReceiptNote.reversedAt
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversedAt" TIMESTAMP(3);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Fix 4: GoodsReceiptNote.reversedBy
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversedBy" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Fix 5: GoodsReceiptNote.reversalReason
DO $$ BEGIN
    ALTER TABLE "GoodsReceiptNote" ADD COLUMN "reversalReason" TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Verification: run after applying to confirm columns exist
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'PurchaseOrder' AND column_name IN ('acknowledgedAt', 'sentAt');

-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'GoodsReceiptNote' AND column_name IN ('reversedAt', 'reversedBy', 'reversalReason');
