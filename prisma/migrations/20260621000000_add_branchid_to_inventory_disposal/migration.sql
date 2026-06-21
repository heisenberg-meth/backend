-- AlterTable
ALTER TABLE "InventoryDisposal" ADD COLUMN "branchId" VARCHAR(255);

-- CreateIndex
CREATE INDEX "InventoryDisposal_tenantId_branchId_idx" ON "InventoryDisposal"("tenantId", "branchId");
