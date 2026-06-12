-- Create InventoryDisposal table
CREATE TABLE "InventoryDisposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'Expired Stock',
    "disposedBy" TEXT,
    "disposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryDisposal_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "InventoryDisposal_tenantId_idx" ON "InventoryDisposal"("tenantId");
CREATE INDEX IF NOT EXISTS "InventoryDisposal_tenantId_disposedAt_idx" ON "InventoryDisposal"("tenantId", "disposedAt");
CREATE INDEX IF NOT EXISTS "InventoryDisposal_medicineId_idx" ON "InventoryDisposal"("medicineId");
CREATE INDEX IF NOT EXISTS "InventoryDisposal_batchId_idx" ON "InventoryDisposal"("batchId");

-- Add foreign key constraints
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_disposedBy_fkey" FOREIGN KEY ("disposedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create DISPOSAL movement type if not exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MovementType') THEN
        -- MovementType enum should already exist; just add value
    END IF;
END $$;

ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'DISPOSAL';
