-- CreateTable
CREATE TABLE "MedicineBarcode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT,
    "barcode" TEXT NOT NULL,
    "barcodeType" VARCHAR(50) NOT NULL DEFAULT 'CODE128',
    "generated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicineBarcode_barcode_key" ON "MedicineBarcode"("barcode");

-- CreateIndex
CREATE INDEX "MedicineBarcode_tenantId_barcode_idx" ON "MedicineBarcode"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "MedicineBarcode_medicineId_idx" ON "MedicineBarcode"("medicineId");

-- CreateIndex
CREATE INDEX "MedicineBarcode_batchId_idx" ON "MedicineBarcode"("batchId");

-- AddForeignKey
ALTER TABLE "MedicineBarcode" ADD CONSTRAINT "MedicineBarcode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBarcode" ADD CONSTRAINT "MedicineBarcode_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineBarcode" ADD CONSTRAINT "MedicineBarcode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
