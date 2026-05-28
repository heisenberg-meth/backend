-- CreateTable
CREATE TABLE "SalesAnomaly" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT,
    "anomalyType" VARCHAR(100) NOT NULL,
    "riskScore" DECIMAL(5,2) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateBillingAlert" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "matchingInvoiceId" TEXT NOT NULL,
    "similarityScore" DECIMAL(5,2) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateBillingAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudInvestigation" (
    "id" TEXT NOT NULL,
    "anomalyId" TEXT NOT NULL,
    "investigatorId" TEXT NOT NULL,
    "resolutionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FraudInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesAnomaly_tenantId_detectedAt_idx" ON "SalesAnomaly"("tenantId", "detectedAt");

-- CreateIndex
CREATE INDEX "DuplicateBillingAlert_detectedAt_idx" ON "DuplicateBillingAlert"("detectedAt");

-- AddForeignKey
ALTER TABLE "SalesAnomaly" ADD CONSTRAINT "SalesAnomaly_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
