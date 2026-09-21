-- Migration: Add unitsPerStrip to InventoryBatch
-- PRD: Selling Price & Tablets per Strip (unitsPerStrip)
-- Date: 2026-09-21
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "unitsPerStrip" INTEGER;