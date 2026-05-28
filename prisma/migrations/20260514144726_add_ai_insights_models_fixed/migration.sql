-- CreateTable
CREATE TABLE "ExecutiveInsight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "insightText" TEXT NOT NULL,
    "confidenceScore" DECIMAL(5,2) NOT NULL,
    "reasoning" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastRecommendation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "predictedQuantity" DECIMAL(15,2) NOT NULL,
    "recommendation" TEXT NOT NULL,
    "priorityScore" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutiveInsight_tenantId_insightType_idx" ON "ExecutiveInsight"("tenantId", "insightType");

-- AddForeignKey
ALTER TABLE "ExecutiveInsight" ADD CONSTRAINT "ExecutiveInsight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastRecommendation" ADD CONSTRAINT "ForecastRecommendation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
