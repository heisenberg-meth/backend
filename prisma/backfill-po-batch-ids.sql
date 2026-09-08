-- Backfill: Associate InventoryBatch with PurchaseOrderItem for previously received items
UPDATE "InventoryBatch"
SET "purchaseOrderItemId" = grni."purchaseOrderItemId"
FROM "GoodsReceiptNoteItem" grni
  JOIN "GoodsReceiptNote" grn ON grn."id" = grni."grnId"
WHERE "InventoryBatch"."purchaseOrderItemId" IS NULL
  AND "InventoryBatch"."tenantId" = grn."tenantId"
  AND "InventoryBatch"."medicineId" = grni."medicineId"
  AND "InventoryBatch"."batchNumber" = grni."batchNumber";
-- Fallback for items where batch exists for received PO items
UPDATE "InventoryBatch"
SET "purchaseOrderItemId" = poi."id"
FROM "PurchaseOrderItem" poi
  JOIN "PurchaseOrder" po ON po."id" = poi."purchaseOrderId"
WHERE "InventoryBatch"."purchaseOrderItemId" IS NULL
  AND "InventoryBatch"."tenantId" = po."tenantId"
  AND "InventoryBatch"."medicineId" = poi."medicineId"
  AND poi."receivedQuantity" > 0;