-- CreateTable
CREATE TABLE "OutbreakPrediction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "diseaseType" TEXT NOT NULL,
    "outbreakRiskScore" DECIMAL(5,2) NOT NULL,
    "predictionWindowDays" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutbreakPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutbreakPrediction_tenantId_generatedAt_idx" ON "OutbreakPrediction"("tenantId", "generatedAt");

-- AddForeignKey
ALTER TABLE "OutbreakPrediction" ADD CONSTRAINT "OutbreakPrediction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
