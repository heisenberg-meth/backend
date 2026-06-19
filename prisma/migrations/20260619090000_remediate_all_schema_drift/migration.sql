-- CreateEnum
DO $$ BEGIN CREATE TYPE "AdminRole" AS ENUM (
    'ROOT_ADMIN',
    'ADMIN',
    'SUPPORT',
    'SALES',
    'FINANCE'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE "SupportTicketStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'WAITING_ON_CUSTOMER',
    'RESOLVED',
    'CLOSED'
);
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'CARD', 'UPI', 'NET_BANKING', 'CREDIT');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- CreateTable
CREATE TABLE IF NOT EXISTS "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "BrowserLock" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrowserLock_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierCreditNoteUsage" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "usedAmount" DECIMAL(12, 2) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "SupplierCreditNoteUsage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "permissions" TEXT [],
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminDevice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "deviceToken" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "ipAddress" TEXT,
    "country" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "blockReason" TEXT,
    CONSTRAINT "AdminDevice_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminFeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "targetType" TEXT,
    "targetIds" TEXT [],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminFeatureFlag_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "createdBy" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE IF NOT EXISTS "SupportTicketReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);
-- AlterTable
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "drugLicenseNumber" TEXT;
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "blacklistedAt" TIMESTAMP(3);
ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "blacklistReason" TEXT;
-- AlterTable
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
-- AlterTable
ALTER TABLE "InventoryBatch"
ADD COLUMN IF NOT EXISTS "recalled" BOOLEAN NOT NULL DEFAULT false;
-- AlterTable
ALTER TABLE "SupplierReturn"
ADD COLUMN IF NOT EXISTS "returnAmount" DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE "SupplierReturn"
ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "SupplierReturn"
ADD COLUMN IF NOT EXISTS "medicineId" TEXT;
ALTER TABLE "SupplierReturn"
ADD COLUMN IF NOT EXISTS "purchaseInvoiceId" TEXT;
-- AlterTable
ALTER TABLE "SupplierCreditNote"
ADD COLUMN IF NOT EXISTS "remainingAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE "SupplierCreditNote"
ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);
ALTER TABLE "SupplierCreditNote"
ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
-- AlterTable
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "advancePaid" DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "balanceAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH';
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder"
ADD COLUMN IF NOT EXISTS "supplierInvoiceNumber" VARCHAR(100);
-- AlterTable
ALTER TABLE "InvoiceItem"
ADD COLUMN IF NOT EXISTS "discountPercentage" DECIMAL(5, 2) NOT NULL DEFAULT 0;
-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Device_deviceToken_key" ON "Device"("deviceToken");
CREATE INDEX IF NOT EXISTS "Device_userId_idx" ON "Device"("userId");
CREATE INDEX IF NOT EXISTS "Device_fingerprintId_idx" ON "Device"("fingerprintId");
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserLock_fingerprintId_key" ON "BrowserLock"("fingerprintId");
CREATE UNIQUE INDEX IF NOT EXISTS "BrowserLock_userId_key" ON "BrowserLock"("userId");
CREATE INDEX IF NOT EXISTS "SupplierCreditNoteUsage_creditNoteId_idx" ON "SupplierCreditNoteUsage"("creditNoteId");
CREATE INDEX IF NOT EXISTS "SupplierCreditNoteUsage_purchaseInvoiceId_idx" ON "SupplierCreditNoteUsage"("purchaseInvoiceId");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_email_key" ON "AdminUser"("email");
CREATE INDEX IF NOT EXISTS "AdminUser_email_idx" ON "AdminUser"("email");
CREATE INDEX IF NOT EXISTS "AdminUser_role_idx" ON "AdminUser"("role");
CREATE INDEX IF NOT EXISTS "AdminUser_isActive_idx" ON "AdminUser"("isActive");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_adminUserId_idx" ON "AdminAuditLog"("adminUserId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminDevice_shopId_idx" ON "AdminDevice"("shopId");
CREATE INDEX IF NOT EXISTS "AdminDevice_fingerprintHash_idx" ON "AdminDevice"("fingerprintHash");
CREATE INDEX IF NOT EXISTS "AdminDevice_ipAddress_idx" ON "AdminDevice"("ipAddress");
CREATE INDEX IF NOT EXISTS "AdminDevice_riskScore_idx" ON "AdminDevice"("riskScore");
CREATE INDEX IF NOT EXISTS "AdminDevice_isBlocked_idx" ON "AdminDevice"("isBlocked");
CREATE UNIQUE INDEX IF NOT EXISTS "AdminFeatureFlag_key_key" ON "AdminFeatureFlag"("key");
CREATE INDEX IF NOT EXISTS "AdminFeatureFlag_enabled_idx" ON "AdminFeatureFlag"("enabled");
CREATE INDEX IF NOT EXISTS "AdminFeatureFlag_targetType_idx" ON "AdminFeatureFlag"("targetType");
CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_priority_idx" ON "SupportTicket"("priority");
CREATE INDEX IF NOT EXISTS "SupportTicket_assignedTo_idx" ON "SupportTicket"("assignedTo");
CREATE INDEX IF NOT EXISTS "SupportTicket_ticketId_idx" ON "SupportTicketReply"("ticketId");
-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "Device"
ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "BrowserLock"
ADD CONSTRAINT "BrowserLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupplierCreditNoteUsage"
ADD CONSTRAINT "SupplierCreditNoteUsage_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "SupplierCreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupplierCreditNoteUsage"
ADD CONSTRAINT "SupplierCreditNoteUsage_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupplierCreditNoteUsage"
ADD CONSTRAINT "SupplierCreditNoteUsage_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE
SET NULL ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;