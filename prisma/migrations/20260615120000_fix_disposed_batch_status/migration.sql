-- Fix: Repair historical disposal data where InventoryBatch was disposed
-- but retains status='EXPIRED' instead of being set to 'ARCHIVED'.
--
-- This ensures disposed inventory no longer appears in expired stock counts.
--
-- Affected batches: those with InventoryDisposal records that are still EXPIRED.

UPDATE "InventoryBatch"
SET status = 'ARCHIVED'
WHERE id IN (
    SELECT ib.id
    FROM "InventoryBatch" ib
    INNER JOIN "InventoryDisposal" d ON d."batchId" = ib.id
    WHERE ib.status = 'EXPIRED'
);
