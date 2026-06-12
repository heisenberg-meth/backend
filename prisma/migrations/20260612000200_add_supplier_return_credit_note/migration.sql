-- Add SUPPLIER_RETURN to MovementType enum
ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'SUPPLIER_RETURN';

-- Add DRAFT and PICKED_UP to SupplierReturnStatus enum
ALTER TYPE "SupplierReturnStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "SupplierReturnStatus" ADD VALUE IF NOT EXISTS 'PICKED_UP';

-- Add new columns to InventoryBatch
ALTER TABLE "InventoryBatch" ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT;
ALTER TABLE "InventoryBatch" ADD COLUMN IF NOT EXISTS "receivedDate" TIMESTAMP(3);

-- Add new columns to SupplierReturn
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "returnNumber" TEXT;
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "pickedUpAt" TIMESTAMP(3);
ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Make batchId and quantity optional in SupplierReturn
ALTER TABLE "SupplierReturn" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "SupplierReturn" ALTER COLUMN "quantity" DROP NOT NULL;

-- Drop and recreate FK for batchId to allow null
ALTER TABLE "SupplierReturn" DROP CONSTRAINT IF EXISTS "SupplierReturn_batchId_fkey";
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create SupplierReturnItem table
CREATE TABLE IF NOT EXISTS "SupplierReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiryDate" DATE,
    "purchasePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierReturnItem_pkey" PRIMARY KEY ("id")
);

-- Create SupplierCreditNote table
CREATE TABLE IF NOT EXISTS "SupplierCreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierCreditNote_pkey" PRIMARY KEY ("id")
);

-- Indexes for SupplierReturnItem
CREATE INDEX IF NOT EXISTS "SupplierReturnItem_returnId_idx" ON "SupplierReturnItem"("returnId");
CREATE INDEX IF NOT EXISTS "SupplierReturnItem_batchId_idx" ON "SupplierReturnItem"("batchId");

-- Indexes for SupplierCreditNote
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierCreditNote_tenantId_creditNoteNumber_key" ON "SupplierCreditNote"("tenantId", "creditNoteNumber");
CREATE INDEX IF NOT EXISTS "SupplierCreditNote_tenantId_supplierId_status_idx" ON "SupplierCreditNote"("tenantId", "supplierId", "status");

-- Indexes for SupplierReturn
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierReturn_tenantId_returnNumber_key" ON "SupplierReturn"("tenantId", "returnNumber");
CREATE INDEX IF NOT EXISTS "SupplierReturn_tenantId_supplierId_status_idx" ON "SupplierReturn"("tenantId", "supplierId", "status");
CREATE INDEX IF NOT EXISTS "SupplierReturn_tenantId_createdAt_idx" ON "SupplierReturn"("tenantId", "createdAt");

-- Foreign keys for SupplierReturnItem
ALTER TABLE "SupplierReturnItem" DROP CONSTRAINT IF EXISTS "SupplierReturnItem_returnId_fkey";
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SupplierReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierReturnItem" DROP CONSTRAINT IF EXISTS "SupplierReturnItem_medicineId_fkey";
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "SupplierReturnItem" DROP CONSTRAINT IF EXISTS "SupplierReturnItem_batchId_fkey";
ALTER TABLE "SupplierReturnItem" ADD CONSTRAINT "SupplierReturnItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Foreign keys for SupplierCreditNote
ALTER TABLE "SupplierCreditNote" DROP CONSTRAINT IF EXISTS "SupplierCreditNote_returnId_fkey";
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SupplierReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierCreditNote" DROP CONSTRAINT IF EXISTS "SupplierCreditNote_supplierId_fkey";
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierCreditNote" DROP CONSTRAINT IF EXISTS "SupplierCreditNote_tenantId_fkey";
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK for supplier return approver
ALTER TABLE "SupplierReturn" DROP CONSTRAINT IF EXISTS "SupplierReturn_approvedBy_fkey";
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- FK for inventory batch purchase invoice
ALTER TABLE "InventoryBatch" DROP CONSTRAINT IF EXISTS "InventoryBatch_purchaseInvoiceId_fkey";
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
