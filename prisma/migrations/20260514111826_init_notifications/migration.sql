/*
  Warnings:

  - You are about to drop the column `title` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "InventoryBatch" ADD COLUMN     "recalled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "title",
DROP COLUMN "type",
ADD COLUMN     "channel" VARCHAR(50),
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "deliveryStatus" VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN     "notificationType" VARCHAR(50),
ADD COLUMN     "recipient" VARCHAR(255),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "subject" VARCHAR(255);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "templateName" VARCHAR(255) NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "templateBody" TEXT NOT NULL,
    "variables" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "notificationType" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_tenantId_templateName_channel_key" ON "NotificationTemplate"("tenantId", "templateName", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_notificationType_key" ON "NotificationPreference"("userId", "channel", "notificationType");

-- CreateIndex
CREATE INDEX "Notification_tenantId_deliveryStatus_idx" ON "Notification"("tenantId", "deliveryStatus");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
