-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onlineDescription" TEXT,
ADD COLUMN     "scheduleType" TEXT,
ADD COLUMN     "storefrontPrice" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pharmacistRegistrationNumber" TEXT;

-- CreateTable
CREATE TABLE "EcommercePricing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "onlinePrice" DOUBLE PRECISION NOT NULL,
    "discountPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommercePricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySyncLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "sourceSystem" VARCHAR(100) NOT NULL,
    "syncStatus" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventorySyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EcommercePricing_tenantId_medicineId_idx" ON "EcommercePricing"("tenantId", "medicineId");

-- CreateIndex
CREATE INDEX "InventorySyncLog_tenantId_syncStatus_idx" ON "InventorySyncLog"("tenantId", "syncStatus");

-- CreateIndex
CREATE INDEX "Delivery_createdAt_idx" ON "Delivery"("createdAt");

-- CreateIndex
CREATE INDEX "OnlineOrder_createdAt_idx" ON "OnlineOrder"("createdAt");

-- AddForeignKey
ALTER TABLE "EcommercePricing" ADD CONSTRAINT "EcommercePricing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcommercePricing" ADD CONSTRAINT "EcommercePricing_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySyncLog" ADD CONSTRAINT "InventorySyncLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySyncLog" ADD CONSTRAINT "InventorySyncLog_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
