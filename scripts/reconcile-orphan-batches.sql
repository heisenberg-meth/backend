-- Reconciliation SQL: Create missing InventoryBatch records for orphan StockMovements
-- Root cause: csv-import.service.js skipped batch creation when batchKey existed in batchMap,
-- but still created StockMovement + Inventory updates unconditionally.
-- Also: both csv-import and bulk-import never set batchId on StockMovement records.
--
-- This script:
-- 1. Creates a new InventoryBatch for each orphan BULK_IMPORT STOCK_IN movement
-- 2. Links the StockMovement to the new batch via batchId
-- 3. Batch number format: RECON-<first 12 chars of movement UUID>

-- =============================================
-- Zoha Tenant: c7f4b8e0-dfe5-4111-ad7c-84a709274c16
-- 8,595 orphan movements, 2,031,091 units
-- =============================================
BEGIN;

CREATE TEMP TABLE _orphan_map AS
SELECT
  sm.id AS movement_id,
  gen_random_uuid() AS new_batch_id,
  sm."tenantId",
  sm."branchId",
  sm."medicineId",
  sm.quantity,
  sm."createdAt",
  sm."performedBy"
FROM "StockMovement" sm
WHERE sm."movementType" = 'STOCK_IN'
  AND sm."batchId" IS NULL
  AND sm."referenceType" = 'BULK_IMPORT'
  AND sm."tenantId" = 'c7f4b8e0-dfe5-4111-ad7c-84a709274c16';

INSERT INTO "InventoryBatch" (
  "id", "tenantId", "branchId", "medicineId",
  "batchNumber", "quantity", "receivedQuantity", "availableQuantity",
  "expiryDate", "purchasePrice", "sellingPrice", "mrp",
  "status", "createdAt", "updatedAt"
)
SELECT
  om.new_batch_id,
  om."tenantId",
  om."branchId",
  om."medicineId",
  'RECON-' || LEFT(REPLACE(om.movement_id::text, '-', ''), 12),
  om.quantity,
  om.quantity,
  om.quantity,
  NOW() + INTERVAL '2 years',
  0, 0, 0,
  'ACTIVE',
  om."createdAt",
  NOW()
FROM _orphan_map om;

UPDATE "StockMovement" sm
SET "batchId" = om.new_batch_id
FROM _orphan_map om
WHERE sm.id = om.movement_id;

DROP TABLE _orphan_map;

COMMIT;

-- =============================================
-- Viyan Tenant: 7e67535f-ea33-4c28-a5a8-236ed40673c1
-- 1 mismatch (Test Import Medicine: Inventory 20 vs Batch 10)
-- =============================================
BEGIN;

CREATE TEMP TABLE _orphan_map AS
SELECT
  sm.id AS movement_id,
  gen_random_uuid() AS new_batch_id,
  sm."tenantId",
  sm."branchId",
  sm."medicineId",
  sm.quantity,
  sm."createdAt",
  sm."performedBy"
FROM "StockMovement" sm
WHERE sm."movementType" = 'STOCK_IN'
  AND sm."batchId" IS NULL
  AND sm."referenceType" = 'BULK_IMPORT'
  AND sm."tenantId" = '7e67535f-ea33-4c28-a5a8-236ed40673c1';

INSERT INTO "InventoryBatch" (
  "id", "tenantId", "branchId", "medicineId",
  "batchNumber", "quantity", "receivedQuantity", "availableQuantity",
  "expiryDate", "purchasePrice", "sellingPrice", "mrp",
  "status", "createdAt", "updatedAt"
)
SELECT
  om.new_batch_id,
  om."tenantId",
  om."branchId",
  om."medicineId",
  'RECON-' || LEFT(REPLACE(om.movement_id::text, '-', ''), 12),
  om.quantity,
  om.quantity,
  om.quantity,
  NOW() + INTERVAL '2 years',
  0, 0, 0,
  'ACTIVE',
  om."createdAt",
  NOW()
FROM _orphan_map om;

UPDATE "StockMovement" sm
SET "batchId" = om.new_batch_id
FROM _orphan_map om
WHERE sm.id = om.movement_id;

DROP TABLE _orphan_map;

COMMIT;
