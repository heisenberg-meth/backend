-- Performance indexes for dashboard and inventory queries
-- InventoryBatch indexes for dashboard stock health metrics
CREATE INDEX IF NOT EXISTS "idx_inventory_batch_tenant_status_qty_expiry" ON "InventoryBatch" ("tenantId", "status", "quantity", "expiryDate")
WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_inventory_batch_tenant_branch_deleted_qty" ON "InventoryBatch" ("tenantId", "branchId", "deletedAt", "quantity")
WHERE "quantity" > 0;
-- InventoryBatch indexes for expiry queries
CREATE INDEX IF NOT EXISTS "idx_inventory_batch_tenant_branch_expiry_qty" ON "InventoryBatch" ("tenantId", "branchId", "expiryDate", "quantity")
WHERE "deletedAt" IS NULL
    AND "quantity" > 0;
-- Medicine indexes for low stock count
CREATE INDEX IF NOT EXISTS "idx_medicine_tenant_deleted_active" ON "Medicine" ("tenantId", "deletedAt", "isActive");
-- Inventory indexes for low stock count
CREATE INDEX IF NOT EXISTS "idx_inventory_tenant_branch_medicine_stock_reorder" ON "Inventory" (
    "tenantId",
    "branchId",
    "medicineId",
    "currentStock",
    "reorderPoint"
);
-- PurchaseOrder indexes for pending orders
CREATE INDEX IF NOT EXISTS "idx_purchase_order_tenant_branch_status_deleted" ON "PurchaseOrder" ("tenantId", "branchId", "status", "deletedAt")
WHERE "status" IN (
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'PARTIALLY_RECEIVED'
    );
-- Sale indexes for sales performance
CREATE INDEX IF NOT EXISTS "idx_sale_tenant_branch_soldat" ON "Sale" ("tenantId", "branchId", "soldAt");
-- SupplierReturn indexes
CREATE INDEX IF NOT EXISTS "idx_supplier_return_tenant_supplier_status" ON "SupplierReturn" ("tenantId", "supplierId", "status");
-- StockMovement indexes for movement queries
CREATE INDEX IF NOT EXISTS "idx_stock_movement_tenant_medicine_batch_type" ON "StockMovement" (
    "tenantId",
    "medicineId",
    "batchId",
    "movementType"
);
-- GoodsReceiptNote indexes
CREATE INDEX IF NOT EXISTS "idx_grn_tenant_po_date" ON "GoodsReceiptNote" ("tenantId", "purchaseOrderId", "receivedDate");
-- PurchaseInvoice indexes
CREATE INDEX IF NOT EXISTS "idx_purchase_invoice_tenant_supplier_date" ON "PurchaseInvoice" ("tenantId", "supplierId", "invoiceDate");
-- SupplierLedger indexes
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_tenant_supplier_created" ON "SupplierLedger" ("tenantId", "supplierId", "createdAt" DESC);
-- AuditLog indexes
CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_action_date" ON "AuditLog" ("tenantId", "action", "date" DESC);
-- BatchAuditLog indexes
CREATE INDEX IF NOT EXISTS "idx_batch_audit_log_batch_action_created" ON "BatchAuditLog" ("batchId", "actionType", "performedAt" DESC);