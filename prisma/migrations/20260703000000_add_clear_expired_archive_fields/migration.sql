-- Migration: Add clear-expired archive fields to InventoryBatch
-- PRD: Clear Expired Batches feature — v1.0
-- Date: 2026-07-03

-- Add archive tracking columns to InventoryBatch
ALTER TABLE "InventoryBatch"
  ADD COLUMN IF NOT EXISTS "isArchived"    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archivedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedBy"    TEXT,
  ADD COLUMN IF NOT EXISTS "archiveReason" VARCHAR(255);

-- Performance index for clearable-count and clear-expired queries
CREATE INDEX IF NOT EXISTS "idx_batch_archive_lookup"
  ON "InventoryBatch" ("tenantId", "isArchived", "status");
