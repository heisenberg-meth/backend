-- CreateTable
CREATE TABLE "CustomerBehavior" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "medicineId" TEXT,
    "purchaseFrequency" INTEGER NOT NULL DEFAULT 0,
    "averagePurchaseInterval" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "adherenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBehavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "segmentName" VARCHAR(100) NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "reminderType" VARCHAR(50) NOT NULL,
    "nextReminderAt" TIMESTAMP(3) NOT NULL,
    "reminderChannel" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "frequencyDays" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "nextDeliveryDate" DATE NOT NULL,
    "autoBilling" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionStatus" VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBehavior_tenantId_customerId_idx" ON "CustomerBehavior"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBehavior_tenantId_customerId_medicineId_key" ON "CustomerBehavior"("tenantId", "customerId", "medicineId");

-- CreateIndex
CREATE INDEX "CustomerSegment_customerId_idx" ON "CustomerSegment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSegment_customerId_segmentName_key" ON "CustomerSegment"("customerId", "segmentName");

-- CreateIndex
CREATE INDEX "MedicineReminder_tenantId_nextReminderAt_idx" ON "MedicineReminder"("tenantId", "nextReminderAt");

-- CreateIndex
CREATE INDEX "MedicineReminder_customerId_idx" ON "MedicineReminder"("customerId");

-- CreateIndex
CREATE INDEX "MedicineSubscription_tenantId_subscriptionStatus_idx" ON "MedicineSubscription"("tenantId", "subscriptionStatus");

-- CreateIndex
CREATE INDEX "MedicineSubscription_nextDeliveryDate_idx" ON "MedicineSubscription"("nextDeliveryDate");

-- CreateIndex
CREATE INDEX "MedicineSubscription_customerId_idx" ON "MedicineSubscription"("customerId");

-- AddForeignKey
ALTER TABLE "CustomerBehavior" ADD CONSTRAINT "CustomerBehavior_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBehavior" ADD CONSTRAINT "CustomerBehavior_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBehavior" ADD CONSTRAINT "CustomerBehavior_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineReminder" ADD CONSTRAINT "MedicineReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineReminder" ADD CONSTRAINT "MedicineReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineReminder" ADD CONSTRAINT "MedicineReminder_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubscription" ADD CONSTRAINT "MedicineSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubscription" ADD CONSTRAINT "MedicineSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubscription" ADD CONSTRAINT "MedicineSubscription_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
