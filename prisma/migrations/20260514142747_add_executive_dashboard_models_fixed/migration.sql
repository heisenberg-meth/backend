-- CreateTable
CREATE TABLE "RevenueSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "snapshotDate" DATE NOT NULL,
    "totalSales" DECIMAL(15,2) NOT NULL,
    "grossProfit" DECIMAL(15,2) NOT NULL,
    "netProfit" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPerformanceMetric" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "metricDate" DATE NOT NULL,
    "salesVolume" DECIMAL(15,2) NOT NULL,
    "profitMargin" DECIMAL(5,2) NOT NULL,
    "stockTurnover" DECIMAL(10,2) NOT NULL,
    "expiryLoss" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchPerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueSnapshot_tenantId_branchId_snapshotDate_key" ON "RevenueSnapshot"("tenantId", "branchId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "RevenueSnapshot" ADD CONSTRAINT "RevenueSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPerformanceMetric" ADD CONSTRAINT "BranchPerformanceMetric_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
