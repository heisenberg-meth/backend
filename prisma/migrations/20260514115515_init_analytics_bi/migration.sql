-- CreateTable
CREATE TABLE "FastMovingMedicine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "medicineId" TEXT NOT NULL,
    "unitsSold" INTEGER NOT NULL DEFAULT 0,
    "salesVelocity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ranking" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastMovingMedicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlowMovingStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "medicineId" TEXT NOT NULL,
    "daysSinceLastSale" INTEGER NOT NULL DEFAULT 0,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "turnoverRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlowMovingStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadStockAnalysis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "medicineId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "stockValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daysDead" INTEGER NOT NULL DEFAULT 0,
    "expiryRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadStockAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueHeatmap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "hourSlot" INTEGER NOT NULL,
    "weekday" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueHeatmap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FastMovingMedicine_tenantId_ranking_idx" ON "FastMovingMedicine"("tenantId", "ranking");

-- CreateIndex
CREATE UNIQUE INDEX "FastMovingMedicine_tenantId_branchId_medicineId_key" ON "FastMovingMedicine"("tenantId", "branchId", "medicineId");

-- CreateIndex
CREATE INDEX "SlowMovingStock_tenantId_daysSinceLastSale_idx" ON "SlowMovingStock"("tenantId", "daysSinceLastSale");

-- CreateIndex
CREATE UNIQUE INDEX "SlowMovingStock_tenantId_branchId_medicineId_key" ON "SlowMovingStock"("tenantId", "branchId", "medicineId");

-- CreateIndex
CREATE INDEX "DeadStockAnalysis_tenantId_stockValue_idx" ON "DeadStockAnalysis"("tenantId", "stockValue");

-- CreateIndex
CREATE UNIQUE INDEX "DeadStockAnalysis_tenantId_branchId_medicineId_key" ON "DeadStockAnalysis"("tenantId", "branchId", "medicineId");

-- CreateIndex
CREATE INDEX "RevenueHeatmap_tenantId_idx" ON "RevenueHeatmap"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueHeatmap_tenantId_branchId_hourSlot_weekday_key" ON "RevenueHeatmap"("tenantId", "branchId", "hourSlot", "weekday");

-- AddForeignKey
ALTER TABLE "FastMovingMedicine" ADD CONSTRAINT "FastMovingMedicine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastMovingMedicine" ADD CONSTRAINT "FastMovingMedicine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FastMovingMedicine" ADD CONSTRAINT "FastMovingMedicine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlowMovingStock" ADD CONSTRAINT "SlowMovingStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlowMovingStock" ADD CONSTRAINT "SlowMovingStock_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlowMovingStock" ADD CONSTRAINT "SlowMovingStock_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadStockAnalysis" ADD CONSTRAINT "DeadStockAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadStockAnalysis" ADD CONSTRAINT "DeadStockAnalysis_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadStockAnalysis" ADD CONSTRAINT "DeadStockAnalysis_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueHeatmap" ADD CONSTRAINT "RevenueHeatmap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueHeatmap" ADD CONSTRAINT "RevenueHeatmap_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
