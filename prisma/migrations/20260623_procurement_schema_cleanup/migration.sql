-- AlterTable: Procurement Schema Cleanup
-- Adds remainingQuantity to PurchaseOrderItem
-- Removes batchNumber/expiryDate from PurchaseOrderItem (GRN-only)
-- Adds supplierInvoiceNumber/invoiceDate to GRN
-- Adds mrp/manufacturingDate to GRN items

ALTER TABLE "PurchaseOrderItem" ADD COLUMN "remainingQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrderItem" DROP COLUMN "batchNumber";
ALTER TABLE "PurchaseOrderItem" DROP COLUMN "expiryDate";

ALTER TABLE "GoodsReceiptNote" ADD COLUMN "supplierInvoiceNumber" TEXT;
ALTER TABLE "GoodsReceiptNote" ADD COLUMN "invoiceDate" TIMESTAMP(3);

ALTER TABLE "GoodsReceiptNoteItem" ADD COLUMN "manufacturingDate" TIMESTAMP(3);
ALTER TABLE "GoodsReceiptNoteItem" ADD COLUMN "mrp" DECIMAL(12,2);
