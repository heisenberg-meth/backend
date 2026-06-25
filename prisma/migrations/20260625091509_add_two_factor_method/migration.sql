/*
  Warnings:

  - You are about to drop the column `quantity` on the `InventoryDisposal` table. All the data in the column will be lost.
  - You are about to alter the column `branchId` on the `InventoryDisposal` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - A unique constraint covering the columns `[tenantId,name]` on the table `Manufacturer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,name]` on the table `MedicineCategory` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,invoiceNumber]` on the table `PurchaseInvoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[drugLicenseNumber]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `batchNumber` to the `InventoryDisposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disposedQuantity` to the `InventoryDisposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mrp` to the `InventoryDisposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchasePrice` to the `InventoryDisposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `InventoryDisposal` table without a default value. This is not possible if the table is not empty.
  - Made the column `disposedBy` on table `InventoryDisposal` required. This step will fail if there are existing NULL values in that column.
  - Made the column `supplierId` on table `PurchaseOrder` required. This step will fail if there are existing NULL values in that column.
  - Made the column `returnNumber` on table `SupplierReturn` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TwoFactorMethod" AS ENUM ('TOTP', 'EMAIL_OTP');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoginStatus" AS ENUM ('SUCCESS', 'FAILED_PASSWORD', 'FAILED_2FA', 'FAILED_LOCKED', 'FAILED_DISABLED', 'FAILED_UNVERIFIED');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_CREATED', 'USER_UPDATED', 'USER_SUSPENDED', 'USER_ACTIVATED', 'USER_BLOCKED', 'USER_DELETED', 'USER_PASSWORD_RESET', 'USER_DEVICE_RESET', 'SHOP_CREATED', 'SHOP_UPDATED', 'SHOP_APPROVED', 'SHOP_SUSPENDED', 'SHOP_BLACKLISTED', 'SHOP_DELETED', 'SUBSCRIPTION_CREATED', 'SUBSCRIPTION_EXTENDED', 'SUBSCRIPTION_UPGRADED', 'SUBSCRIPTION_DOWNGRADED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_RENEWED', 'PAYMENT_RECEIVED', 'PAYMENT_REFUNDED', 'PAYMENT_FAILED', 'DEVICE_BLOCKED', 'DEVICE_UNBLOCKED', 'FEATURE_FLAG_TOGGLED', 'BROADCAST_SENT', 'ADMIN_LOGIN', 'ADMIN_LOGOUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'SENT_TO_SUPPLIER';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'ACKNOWLEDGED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'REJECTED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'CLOSED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchasePaymentStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "PurchasePaymentStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SalePaymentStatus" ADD VALUE 'FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SaleStatus" ADD VALUE 'DRAFT';
ALTER TYPE "SaleStatus" ADD VALUE 'PARTIAL_RETURN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierReturnStatus" ADD VALUE 'DISPATCHED';
ALTER TYPE "SupplierReturnStatus" ADD VALUE 'RECEIVED';

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'UNVERIFIED';

-- DropForeignKey
ALTER TABLE "InventoryDisposal" DROP CONSTRAINT "InventoryDisposal_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryDisposal" DROP CONSTRAINT "InventoryDisposal_disposedBy_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceAuditLog" DROP CONSTRAINT "InvoiceAuditLog_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceDeliveryLog" DROP CONSTRAINT "InvoiceDeliveryLog_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePayment" DROP CONSTRAINT "InvoicePayment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoicePrintJob" DROP CONSTRAINT "InvoicePrintJob_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentSession" DROP CONSTRAINT "PaymentSession_subscription_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_supplierId_fkey";

-- DropIndex
DROP INDEX "InventoryDisposal_tenantId_disposedAt_idx";

-- DropIndex
DROP INDEX "Manufacturer_tenantId_name_idx";

-- DropIndex
DROP INDEX "Medicine_tenantId_name_idx";

-- DropIndex
DROP INDEX "idx_medicine_medicineType";

-- DropIndex
DROP INDEX "idx_medicine_schedule";

-- DropIndex
DROP INDEX "MedicineCategory_tenantId_name_idx";

-- DropIndex
DROP INDEX "SupplierReturn_dispatchStatus_idx";

-- DropIndex
DROP INDEX "idx_user_status";

-- DropIndex
DROP INDEX "idx_user_status_tenant";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "isTrusted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trustedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InventoryDisposal" DROP COLUMN "quantity",
ADD COLUMN     "batchNumber" VARCHAR(100) NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "disposedQuantity" INTEGER NOT NULL,
ADD COLUMN     "mrp" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "purchasePrice" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "branchId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "reason" DROP DEFAULT,
ALTER COLUMN "disposedBy" SET NOT NULL;

-- AlterTable
ALTER TABLE "Medicine" ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "paidAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "supplierId" SET NOT NULL,
ALTER COLUMN "paymentMode" DROP NOT NULL,
ALTER COLUMN "paymentMode" DROP DEFAULT,
ALTER COLUMN "supplierInvoiceNumber" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "SupplierReturn" ALTER COLUMN "returnNumber" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationExpiry" TIMESTAMP(3),
ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "pendingEmail" TEXT,
ADD COLUMN     "twoFactorMethod" "TwoFactorMethod" NOT NULL DEFAULT 'TOTP';

-- AlterTable
ALTER TABLE "UserSession" ADD COLUMN     "authVersion" TEXT NOT NULL DEFAULT 'v1';

-- CreateTable
CREATE TABLE "UserPasswordHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPasswordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRecoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "identityData" JSONB,
    "status" "RecoveryStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "country" TEXT,
    "city" TEXT,
    "status" "LoginStatus" NOT NULL DEFAULT 'SUCCESS',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderRevision" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "revisedBy" TEXT,
    "revisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT,
    "debitNoteNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPasswordHistory_userId_idx" ON "UserPasswordHistory"("userId");

-- CreateIndex
CREATE INDEX "UserBackupCode_userId_idx" ON "UserBackupCode"("userId");

-- CreateIndex
CREATE INDEX "AccountRecoveryRequest_userId_status_idx" ON "AccountRecoveryRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "AccountRecoveryRequest_status_idx" ON "AccountRecoveryRequest"("status");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_createdAt_idx" ON "LoginHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginHistory_email_createdAt_idx" ON "LoginHistory"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginHistory_ipAddress_createdAt_idx" ON "LoginHistory"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderRevision_purchaseOrderId_idx" ON "PurchaseOrderRevision"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "ProcurementAttachment_tenantId_entityType_entityId_idx" ON "ProcurementAttachment"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "DebitNote_tenantId_supplierId_idx" ON "DebitNote"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_tenantId_debitNoteNumber_key" ON "DebitNote"("tenantId", "debitNoteNumber");

-- CreateIndex
CREATE INDEX "Expense_tenantId_branchId_expenseDate_idx" ON "Expense"("tenantId", "branchId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_tenantId_deletedAt_idx" ON "Expense"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Inventory_tenantId_branchId_currentStock_idx" ON "Inventory"("tenantId", "branchId", "currentStock");

-- CreateIndex
CREATE INDEX "idx_batch_fefo" ON "InventoryBatch"("tenantId", "branchId", "medicineId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_deletedAt_idx" ON "InventoryBatch"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_status_expiryDate_idx" ON "InventoryBatch"("tenantId", "status", "expiryDate");

-- CreateIndex
CREATE INDEX "InventoryBatch_barcode_idx" ON "InventoryBatch"("barcode");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_branchId_deletedAt_idx" ON "InventoryBatch"("tenantId", "branchId", "deletedAt");

-- CreateIndex
CREATE INDEX "InventoryBatch_tenantId_deletedAt_branchId_medicineId_idx" ON "InventoryBatch"("tenantId", "deletedAt", "branchId", "medicineId");

-- CreateIndex
CREATE INDEX "InventoryDisposal_tenantId_branchId_idx" ON "InventoryDisposal"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "idx_invoice_tenant_status" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_deletedAt_idx" ON "Invoice"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_branchId_createdAt_idx" ON "Invoice"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceItem_medicineId_idx" ON "InvoiceItem"("medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_tenantId_name_key" ON "Manufacturer"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_medicineName_idx" ON "Medicine"("tenantId", "medicineName");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_deletedAt_idx" ON "Medicine"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineCategory_tenantId_name_key" ON "MedicineCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_invoiceDate_idx" ON "PurchaseInvoice"("tenantId", "invoiceDate");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_paymentStatus_idx" ON "PurchaseInvoice"("tenantId", "paymentStatus");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_purchaseOrderId_idx" ON "PurchaseInvoice"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_createdAt_idx" ON "PurchaseInvoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_tenantId_dueDate_idx" ON "PurchaseInvoice"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_tenantId_invoiceNumber_key" ON "PurchaseInvoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Return_tenantId_branchId_createdAt_idx" ON "Return"("tenantId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Return_tenantId_patientId_createdAt_idx" ON "Return"("tenantId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Return_saleId_idx" ON "Return"("saleId");

-- CreateIndex
CREATE INDEX "Sale_tenantId_status_soldAt_idx" ON "Sale"("tenantId", "status", "soldAt");

-- CreateIndex
CREATE INDEX "SaleItem_medicineId_idx" ON "SaleItem"("medicineId");

-- CreateIndex
CREATE INDEX "idx_supplier_return_purchase_invoice" ON "SupplierReturn"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_drugLicenseNumber_key" ON "Tenant"("drugLicenseNumber");

-- AddForeignKey
ALTER TABLE "UserPasswordHistory" ADD CONSTRAINT "UserPasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBackupCode" ADD CONSTRAINT "UserBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRecoveryRequest" ADD CONSTRAINT "AccountRecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Subscription"("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "SupplierReturn" ADD CONSTRAINT "SupplierReturn_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierCreditNote" ADD CONSTRAINT "SupplierCreditNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderRevision" ADD CONSTRAINT "PurchaseOrderRevision_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePrintJob" ADD CONSTRAINT "InvoicePrintJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDeliveryLog" ADD CONSTRAINT "InvoiceDeliveryLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryDisposal" ADD CONSTRAINT "InventoryDisposal_disposedBy_fkey" FOREIGN KEY ("disposedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_purchase_invoice_tenant_supplier_date" RENAME TO "PurchaseInvoice_tenantId_supplierId_invoiceDate_idx";

-- RenameIndex
ALTER INDEX "idx_sale_tenant_branch_soldat" RENAME TO "Sale_tenantId_branchId_soldAt_idx";
