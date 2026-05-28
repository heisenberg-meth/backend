-- CreateTable
CREATE TABLE "ExpiryRiskPrediction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "branchId" TEXT,
    "riskScore" DECIMAL(5,2) NOT NULL,
    "predictedUnsoldQty" INTEGER NOT NULL,
    "recommendation" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpiryRiskPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpiryDiscountRecommendation" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "branchId" TEXT,
    "suggestedDiscount" DECIMAL(5,2) NOT NULL,
    "expectedSellthrough" DECIMAL(5,2) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpiryDiscountRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpiryRiskPrediction_tenantId_riskScore_idx" ON "ExpiryRiskPrediction"("tenantId", "riskScore");

-- AddForeignKey
ALTER TABLE "ExpiryRiskPrediction" ADD CONSTRAINT "ExpiryRiskPrediction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryRiskPrediction" ADD CONSTRAINT "ExpiryRiskPrediction_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryRiskPrediction" ADD CONSTRAINT "ExpiryRiskPrediction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryRiskPrediction" ADD CONSTRAINT "ExpiryRiskPrediction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
