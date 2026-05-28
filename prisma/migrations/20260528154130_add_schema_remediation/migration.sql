/*
  Warnings:

  - The `status` column on the `BatchRecall` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Branch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `totalRevenue` on the `DailyFinanceSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalCogs` on the `DailyFinanceSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `grossProfit` on the `DailyFinanceSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalExpenses` on the `DailyFinanceSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `netProfit` on the `DailyFinanceSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalPurchase` on the `DailyPurchaseSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalReturns` on the `DailyPurchaseSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalInputGst` on the `DailyPurchaseSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalSales` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalDiscount` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalReturns` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalGst` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `cashSales` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `cardSales` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `upiSales` on the `DailySalesSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `stockValue` on the `DeadStockAnalysis` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `deliveryStatus` column on the `Delivery` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Doctor` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `onlinePrice` on the `EcommercePricing` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `Expense` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `resolved` on the `ExpiryAlert` table. All the data in the column will be lost.
  - The `resolutionStatus` column on the `FraudInvestigation` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `totalSalesGst` on the `GstSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalPurchaseGst` on the `GstSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `outputTax` on the `GstSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `inputTaxCredit` on the `GstSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `netGstPayable` on the `GstSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `deviceStatus` column on the `HardwareDevice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `taxableValue` on the `HsnSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalGst` on the `HsnSummary` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `branchId` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `batchNumber` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `barcode` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `purchasePrice` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `sellingPrice` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `mrp` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `status` column on the `InventoryBatch` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `rackLocation` on the `InventoryBatch` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - The `syncStatus` column on the `InventorySyncLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `customerId` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `Invoice` table. All the data in the column will be lost.
  - You are about to alter the column `invoiceNumber` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.
  - You are about to alter the column `subtotal` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `discountAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `discountPercentage` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,2)`.
  - You are about to alter the column `gstAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `paidAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `balanceAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `paymentStatus` column on the `Invoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Invoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `discountPercentage` on the `InvoiceItem` table. All the data in the column will be lost.
  - You are about to alter the column `unitPrice` on the `InvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `gstPercentage` on the `InvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(5,2)`.
  - You are about to alter the column `totalPrice` on the `InvoiceItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `JournalEntry` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `customerId` on the `LoyaltyTransaction` table. All the data in the column will be lost.
  - You are about to drop the column `isRecalled` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `rackLocation` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `sellingPrice` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `storefrontPrice` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `Medicine` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `MedicineSubscription` table. All the data in the column will be lost.
  - The `subscriptionStatus` column on the `MedicineSubscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `price` on the `MedicineSupplier` table. All the data in the column will be lost.
  - You are about to drop the column `customerId` on the `Notification` table. All the data in the column will be lost.
  - The `deliveryStatus` column on the `Notification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `customerId` on the `OnlineOrder` table. All the data in the column will be lost.
  - The `orderStatus` column on the `OnlineOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentStatus` column on the `OnlineOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `totalAmount` on the `OnlineOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `unitPrice` on the `OnlineOrderItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalPrice` on the `OnlineOrderItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `admissionStatus` column on the `PatientAdmission` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `customerId` on the `Prescription` table. All the data in the column will be lost.
  - The `verificationStatus` column on the `Prescription` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `PrescriptionVerification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paymentStatus` column on the `PurchaseInvoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `subtotal` on the `PurchaseInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `gstAmount` on the `PurchaseInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `PurchaseInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `subtotal` on the `PurchaseOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `gstAmount` on the `PurchaseOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `PurchaseOrder` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `unitPrice` on the `PurchaseOrderItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `PurchaseOrderItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `revenue` on the `RevenueHeatmap` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `currentStatus` column on the `Rider` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `customerId` on the `Sale` table. All the data in the column will be lost.
  - You are about to alter the column `subtotal` on the `Sale` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `discountAmount` on the `Sale` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `gstAmount` on the `Sale` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `Sale` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `paymentStatus` column on the `Sale` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Sale` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `unitPrice` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `discountAmount` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `gstAmount` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `SaleItem` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `refundAmount` on the `SalesReturn` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `status` column on the `SalesReturn` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Shift` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `customerId` on the `SmsNotification` table. All the data in the column will be lost.
  - The `status` column on the `SmsNotification` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `price` on the `SubscriptionPlan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `billingCycle` column on the `SubscriptionPlan` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Supplier` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `totalPurchases` on the `Supplier` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `debitAmount` on the `SupplierLedger` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `creditAmount` on the `SupplierLedger` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `balanceAfter` on the `SupplierLedger` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `SupplierPayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - The `status` column on the `SupplierReturn` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `TallyExport` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `sslStatus` column on the `TenantDomain` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to drop the column `deviceInfo` on the `UserSession` table. All the data in the column will be lost.
  - You are about to drop the column `refreshTokenHash` on the `UserSession` table. All the data in the column will be lost.
  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerBehavior` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerPrescription` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomerSegment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InventoryTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MedicationReminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MedicineReminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockTransaction` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tenantId,code]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,branchId,salesDate]` on the table `DailySalesSummary` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,branchId,medicineId,batchNumber]` on the table `InventoryBatch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,invoiceNumber]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[sku]` on the table `Medicine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,barcode]` on the table `Medicine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,barcode]` on the table `MedicineBarcode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,admissionNumber]` on the table `PatientAdmission` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKeyHash]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,prescriptionNumber]` on the table `Prescription` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,orderNumber]` on the table `PurchaseOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,transferNumber]` on the table `StockTransfer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,gstNumber]` on the table `Supplier` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,supplierCode]` on the table `Supplier` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[refreshToken]` on the table `UserSession` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `ExpiryAlert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `InventoryBatch` table without a default value. This is not possible if the table is not empty.
  - Made the column `branchId` on table `Invoice` required. This step will fail if there are existing NULL values in that column.
  - Made the column `batchId` on table `InvoiceItem` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `patientId` to the `LoyaltyTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `runningBalance` to the `LoyaltyTransaction` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `type` on the `LoyaltyTransaction` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `patientId` to the `MedicineSubscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `MedicineSupplier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MedicineSupplier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `patientId` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Made the column `medicineId` on table `PurchaseOrderItem` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `StockAlert` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refreshToken` to the `UserSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'SNOOZED', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'ON_ORDER');

-- CreateEnum
CREATE TYPE "MedicineStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED', 'BLOCKED', 'RESTRICTED', 'RECALLED');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('WHOLESALER', 'MANUFACTURER', 'DISTRIBUTOR', 'LOCAL_VENDOR');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'BLACKLISTED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "CreditAccountStatus" AS ENUM ('ACTIVE', 'OVERDUE', 'BLOCKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED', 'BONUS', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT_ISSUED', 'PAYMENT_RECEIVED', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'LOW_STOCK', 'EXPIRING', 'EXPIRED', 'RECALLED', 'QUARANTINED', 'ARCHIVED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "BatchStorageType" AS ENUM ('NORMAL', 'REFRIGERATED', 'FROZEN', 'CONTROLLED_SUBSTANCE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADED', 'SCANNED', 'QUARANTINED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "StoreProfileStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('HEALTHY', 'LOW_STOCK', 'OUT_OF_STOCK', 'OVERSTOCK');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED', 'DECEASED');

-- CreateEnum
CREATE TYPE "DoctorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PENDING', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('PENDING', 'PAID', 'UNPAID', 'PARTIAL', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'APPLIED', 'VOIDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReturnRefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SupplierPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTING', 'PRINTED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "PrescriptionVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ACTIVE', 'DISCHARGED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrescriptionUploadStatus" AS ENUM ('UPLOADED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnlineOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationRetryStatus" AS ENUM ('PENDING', 'RETRYING', 'SUCCESS', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "BatchRecallStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TallyExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "HardwareDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SettingsApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "MedicineSubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'SALE', 'PURCHASE', 'RETURN', 'DAMAGE', 'EXPIRED', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "TenantDomainSslStatus" AS ENUM ('PENDING', 'ISSUED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "FraudResolutionStatus" AS ENUM ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SmsNotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('SYSTEM', 'USER', 'INTEGRATION', 'BATCH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'INITIATED';
ALTER TYPE "PaymentStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "PaymentStatus" ADD VALUE 'CAPTURED';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'RECONCILING';
ALTER TYPE "PaymentStatus" ADD VALUE 'RECOVERY_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE 'RECONCILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockAlertType" ADD VALUE 'OVERSTOCK';
ALTER TYPE "StockAlertType" ADD VALUE 'PROCUREMENT_DELAY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionStatus" ADD VALUE 'INITIATED';
ALTER TYPE "TransactionStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "TransactionStatus" ADD VALUE 'CAPTURED';
ALTER TYPE "TransactionStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "TransactionStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "TransactionStatus" ADD VALUE 'RECONCILING';
ALTER TYPE "TransactionStatus" ADD VALUE 'RECOVERY_PENDING';
ALTER TYPE "TransactionStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "TransactionStatus" ADD VALUE 'REVERSED';

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerBehavior" DROP CONSTRAINT "CustomerBehavior_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerBehavior" DROP CONSTRAINT "CustomerBehavior_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerBehavior" DROP CONSTRAINT "CustomerBehavior_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerPrescription" DROP CONSTRAINT "CustomerPrescription_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerPrescription" DROP CONSTRAINT "CustomerPrescription_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerSegment" DROP CONSTRAINT "CustomerSegment_customerId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryBatch" DROP CONSTRAINT "InventoryBatch_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_batchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_branchId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_performedBy_fkey";

-- DropForeignKey
ALTER TABLE "InventoryTransaction" DROP CONSTRAINT "InventoryTransaction_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_customerId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_batchId_fkey";

-- DropForeignKey
ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT "LoyaltyTransaction_customerId_fkey";

-- DropForeignKey
ALTER TABLE "MedicationReminder" DROP CONSTRAINT "MedicationReminder_customerId_fkey";

-- DropForeignKey
ALTER TABLE "MedicationReminder" DROP CONSTRAINT "MedicationReminder_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "MedicationReminder" DROP CONSTRAINT "MedicationReminder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MedicineReminder" DROP CONSTRAINT "MedicineReminder_customerId_fkey";

-- DropForeignKey
ALTER TABLE "MedicineReminder" DROP CONSTRAINT "MedicineReminder_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "MedicineReminder" DROP CONSTRAINT "MedicineReminder_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "MedicineSubscription" DROP CONSTRAINT "MedicineSubscription_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_customerId_fkey";

-- DropForeignKey
ALTER TABLE "OnlineOrder" DROP CONSTRAINT "OnlineOrder_customerId_fkey";

-- DropForeignKey
ALTER TABLE "PatientIdentityMap" DROP CONSTRAINT "PatientIdentityMap_internalPatientId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_customerId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT "PurchaseOrderItem_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- DropForeignKey
ALTER TABLE "SmsNotification" DROP CONSTRAINT "SmsNotification_customerId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransaction" DROP CONSTRAINT "StockTransaction_batchId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransaction" DROP CONSTRAINT "StockTransaction_medicineId_fkey";

-- DropForeignKey
ALTER TABLE "StockTransaction" DROP CONSTRAINT "StockTransaction_tenantId_fkey";

-- DropIndex
DROP INDEX "Branch_code_key";

-- DropIndex
DROP INDEX "DailySalesSummary_tenantId_salesDate_key";

-- DropIndex
DROP INDEX "ExpiryAlert_tenantId_resolved_idx";

-- DropIndex
DROP INDEX "InventoryBatch_branchId_idx";

-- DropIndex
DROP INDEX "InventoryBatch_medicineId_batchNumber_idx";

-- DropIndex
DROP INDEX "Invoice_invoiceNumber_idx";

-- DropIndex
DROP INDEX "Invoice_invoiceNumber_key";

-- DropIndex
DROP INDEX "Invoice_tenantId_customerId_idx";

-- DropIndex
DROP INDEX "InvoiceItem_medicineId_idx";

-- DropIndex
DROP INDEX "LoyaltyTransaction_customerId_idx";

-- DropIndex
DROP INDEX "MedicineBarcode_barcode_key";

-- DropIndex
DROP INDEX "MedicineSubscription_customerId_idx";

-- DropIndex
DROP INDEX "PatientAdmission_admissionNumber_key";

-- DropIndex
DROP INDEX "Prescription_customerId_idx";

-- DropIndex
DROP INDEX "PurchaseOrder_orderNumber_key";

-- DropIndex
DROP INDEX "StockTransfer_transferNumber_key";

-- DropIndex
DROP INDEX "Supplier_supplierCode_key";

-- DropIndex
DROP INDEX "Supplier_tenantId_gstNumber_idx";

-- DropIndex
DROP INDEX "Transaction_paymentId_key";

-- AlterTable
ALTER TABLE "BatchRecall" DROP COLUMN "status",
ADD COLUMN     "status" "BatchRecallStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "deletedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "DailyFinanceSummary" ALTER COLUMN "totalRevenue" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalCogs" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "grossProfit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalExpenses" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "netProfit" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DailyPurchaseSummary" ALTER COLUMN "totalPurchase" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalReturns" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalInputGst" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DailySalesSummary" ADD COLUMN     "branchId" TEXT,
ALTER COLUMN "totalSales" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalDiscount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalReturns" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalGst" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "cashSales" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "cardSales" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "upiSales" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "DeadStockAnalysis" ALTER COLUMN "stockValue" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Delivery" DROP COLUMN "deliveryStatus",
ADD COLUMN     "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "deletedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "DoctorStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "EcommercePricing" ALTER COLUMN "onlinePrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "ExpiryAlert" DROP COLUMN "resolved",
ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedBy" TEXT,
ADD COLUMN     "alertStatus" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isResolved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "potentialLoss" DECIMAL(12,2),
ADD COLUMN     "recommendedAction" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT,
ADD COLUMN     "snoozeReason" TEXT,
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "severity" SET DEFAULT 'INFO';

-- AlterTable
ALTER TABLE "FraudInvestigation" DROP COLUMN "resolutionStatus",
ADD COLUMN     "resolutionStatus" "FraudResolutionStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "GstSummary" ALTER COLUMN "totalSalesGst" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPurchaseGst" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "outputTax" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "inputTaxCredit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "netGstPayable" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "HardwareDevice" DROP COLUMN "deviceStatus",
ADD COLUMN     "deviceStatus" "HardwareDeviceStatus" NOT NULL DEFAULT 'OFFLINE';

-- AlterTable
ALTER TABLE "HsnSummary" ALTER COLUMN "taxableValue" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalGst" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "InventoryBatch" ADD COLUMN     "availableQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseOrderItemId" TEXT,
ADD COLUMN     "recallReason" TEXT,
ADD COLUMN     "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "storageType" "BatchStorageType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "tenantId" TEXT NOT NULL,
ALTER COLUMN "branchId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "batchNumber" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "barcode" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "expiryDate" SET DATA TYPE DATE,
ALTER COLUMN "manufacturingDate" SET DATA TYPE DATE,
ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "sellingPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "mrp" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "status",
ADD COLUMN     "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "rackLocation" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "InventorySyncLog" DROP COLUMN "syncStatus",
ADD COLUMN     "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "customerId",
DROP COLUMN "paymentMethod",
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isCancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "patientName" TEXT,
ADD COLUMN     "patientPhone" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "prescriptionId" TEXT,
ADD COLUMN     "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "storedSnapshot" JSONB,
ALTER COLUMN "branchId" SET NOT NULL,
ALTER COLUMN "invoiceNumber" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discountPercentage" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceAmount" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
DROP COLUMN "status",
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "InvoiceItem" DROP COLUMN "discountPercentage",
ADD COLUMN     "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "batchId" SET NOT NULL,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "gstPercentage" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "JournalEntry" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "LoyaltyTransaction" DROP COLUMN "customerId",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "patientId" TEXT NOT NULL,
ADD COLUMN     "runningBalance" INTEGER NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "LoyaltyTransactionType" NOT NULL;

-- AlterTable
ALTER TABLE "Medicine" DROP COLUMN "isRecalled",
DROP COLUMN "rackLocation",
DROP COLUMN "sellingPrice",
DROP COLUMN "storefrontPrice",
DROP COLUMN "unitPrice",
ADD COLUMN     "composition" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "reorderQuantity" INTEGER,
ADD COLUMN     "status" "MedicineStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "storageCondition" TEXT,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "MedicineSubscription" DROP COLUMN "customerId",
ADD COLUMN     "patientId" TEXT NOT NULL,
DROP COLUMN "subscriptionStatus",
ADD COLUMN     "subscriptionStatus" "MedicineSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "MedicineSupplier" DROP COLUMN "price",
ADD COLUMN     "averagePurchasePrice" DECIMAL(12,2),
ADD COLUMN     "contractPrice" DECIMAL(12,2),
ADD COLUMN     "lastPurchaseDate" TIMESTAMP(3),
ADD COLUMN     "lastPurchasePrice" DECIMAL(12,2),
ADD COLUMN     "reliabilityScore" DOUBLE PRECISION DEFAULT 100,
ADD COLUMN     "tenantId" TEXT NOT NULL,
ADD COLUMN     "totalPurchasedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "leadDays" SET DEFAULT 7;

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "customerId",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "lastRetryAt" TIMESTAMP(3),
ADD COLUMN     "maxRetries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "providerConfigId" TEXT,
ADD COLUMN     "providerMessageId" VARCHAR(255),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "deliveryStatus",
ADD COLUMN     "deliveryStatus" "NotificationStatus" NOT NULL DEFAULT 'QUEUED';

-- AlterTable
ALTER TABLE "OnlineOrder" DROP COLUMN "customerId",
ADD COLUMN     "patientId" TEXT,
DROP COLUMN "orderStatus",
ADD COLUMN     "orderStatus" "OnlineOrderStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "OnlineOrderItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "PatientAdmission" DROP COLUMN "admissionStatus",
ADD COLUMN     "admissionStatus" "AdmissionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "idempotencyKeyHash" TEXT,
ADD COLUMN     "lastRecoveryAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "razorpaySignature" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transactionReference" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Prescription" DROP COLUMN "customerId",
ADD COLUMN     "insuranceCoveragePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "patientId" TEXT NOT NULL,
ADD COLUMN     "refillCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refillMax" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedBy" TEXT,
DROP COLUMN "verificationStatus",
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "PrescriptionItem" ADD COLUMN     "dispensedQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dispensingWindowDays" INTEGER DEFAULT 30,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "refillEligible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PrescriptionVerification" DROP COLUMN "status",
ADD COLUMN     "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "balanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "medicineId" SET NOT NULL,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "RevenueHeatmap" ALTER COLUMN "revenue" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Rider" DROP COLUMN "currentStatus",
ADD COLUMN     "currentStatus" "RiderStatus" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "customerId",
ADD COLUMN     "patientId" TEXT,
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PAID',
DROP COLUMN "status",
ADD COLUMN     "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "SaleItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "gstAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN     "invoiceItemId" TEXT,
ALTER COLUMN "refundAmount" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "status",
ADD COLUMN     "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Shift" DROP COLUMN "status",
ADD COLUMN     "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "SmsNotification" DROP COLUMN "customerId",
ADD COLUMN     "patientId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "SmsNotificationStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "StockAlert" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedBy" TEXT,
ADD COLUMN     "alertStatus" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currentStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "daysRemaining" INTEGER,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseOrderId" TEXT,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedBy" TEXT,
ADD COLUMN     "severity" TEXT NOT NULL DEFAULT 'INFO',
ADD COLUMN     "snoozeReason" TEXT,
ADD COLUMN     "snoozedBy" TEXT,
ADD COLUMN     "thresholdValue" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "billingCycle",
ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ifscCode" TEXT,
ADD COLUMN     "isPreferred" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenseExpiry" TIMESTAMP(3),
ADD COLUMN     "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierType" "SupplierType" NOT NULL DEFAULT 'WHOLESALER',
ALTER COLUMN "rating" SET DEFAULT 5.0,
DROP COLUMN "status",
ADD COLUMN     "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "totalPurchases" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SupplierLedger" ALTER COLUMN "debitAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "creditAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SupplierMetrics" ADD COLUMN     "avgExpiryShelfLife" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fulfillmentRate" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "pricingStabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "rejectionRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "status" "SupplierPaymentStatus" NOT NULL DEFAULT 'COMPLETED',
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SupplierReturn" DROP COLUMN "status",
ADD COLUMN     "status" "SupplierReturnStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "TallyExport" DROP COLUMN "status",
ADD COLUMN     "status" "TallyExportStatus" NOT NULL DEFAULT 'COMPLETED';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxBranches" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "maxUsers" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TenantDomain" DROP COLUMN "sslStatus",
ADD COLUMN     "sslStatus" "TenantDomainSslStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "gatewayResponse" JSONB,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetOtp" TEXT,
ADD COLUMN     "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resetOtpExpiry" TIMESTAMP(3),
ADD COLUMN     "resetOtpLastSentAt" TIMESTAMP(3),
ADD COLUMN     "resetOtpVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "UserSession" DROP COLUMN "deviceInfo",
DROP COLUMN "refreshTokenHash",
ADD COLUMN     "deviceName" TEXT,
ADD COLUMN     "fingerprintHash" TEXT,
ADD COLUMN     "refreshToken" TEXT NOT NULL,
ADD COLUMN     "userAgent" TEXT;

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "CustomerBehavior";

-- DropTable
DROP TABLE "CustomerPrescription";

-- DropTable
DROP TABLE "CustomerSegment";

-- DropTable
DROP TABLE "InventoryTransaction";

-- DropTable
DROP TABLE "MedicationReminder";

-- DropTable
DROP TABLE "MedicineReminder";

-- DropTable
DROP TABLE "StockTransaction";

-- CreateTable
CREATE TABLE "AlertSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" VARCHAR(255),
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 20,
    "criticalStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
    "criticalExpiryDays" INTEGER NOT NULL DEFAULT 7,
    "autoRaisePO" BOOLEAN NOT NULL DEFAULT false,
    "escalationHours" INTEGER NOT NULL DEFAULT 24,
    "updatedBy" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AlertSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertThresholdOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertSettingsId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "lowStockThreshold" INTEGER,
    "criticalStockThreshold" INTEGER,
    "expiryWarningDays" INTEGER,
    "criticalExpiryDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT,

    CONSTRAINT "AlertThresholdOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIdempotency" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAuditLog" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "transition" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhook" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecovery" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recoveryType" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "healedCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicinePricing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "mrp" DECIMAL(12,2) NOT NULL,
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicinePricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "interactsWithId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugAlternative" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "alternativeId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrugAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" VARCHAR(255),
    "medicineId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "reservedStock" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 10,
    "reorderQuantity" INTEGER NOT NULL DEFAULT 50,
    "minimumStock" INTEGER NOT NULL DEFAULT 5,
    "maximumStock" INTEGER NOT NULL DEFAULT 500,
    "status" "InventoryStatus" NOT NULL DEFAULT 'HEALTHY',
    "rackLocation" TEXT,
    "lastAuditAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "performedBy" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT,
    "movementType" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityBefore" INTEGER,
    "quantityAfter" INTEGER,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "performedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderApproval" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvalNotes" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptNoteItem" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "purchasePrice" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),

    CONSTRAINT "GoodsReceiptNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientCode" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" TEXT,
    "medicalHistory" TEXT,
    "allergies" JSONB,
    "chronicConditions" JSONB,
    "age" INTEGER,
    "bloodGroup" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditUsed" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "allowEmail" BOOLEAN NOT NULL DEFAULT true,
    "allowSms" BOOLEAN NOT NULL DEFAULT true,
    "allowWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContact" TEXT,
    "insuranceCoveragePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insurancePolicyNo" TEXT,
    "insuranceProvider" TEXT,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "description" TEXT,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInsuranceClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "coverageAmount" DECIMAL(12,2) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientInsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADED',
    "checksum" TEXT,
    "uploadedBy" TEXT,
    "prescriptionId" TEXT,
    "invoiceId" TEXT,
    "patientId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importType" TEXT NOT NULL,
    "importStatus" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedBy" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "extractedData" JSONB,
    "errorMessage" TEXT,
    "purchaseOrderId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportExtractedItem" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "extractedName" TEXT,
    "matchedMedicineId" TEXT,
    "confidenceScore" DECIMAL(5,2),
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER,
    "unitPrice" DECIMAL(12,2),
    "gstPercentage" DECIMAL(5,2),
    "totalAmount" DECIMAL(12,2),
    "validationErrors" JSONB,
    "status" "ImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportExtractedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionReference" VARCHAR(255),
    "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePrintJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "printerType" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "printStatus" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "printerEndpoint" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicePrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDeliveryLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "deliveryChannel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "providerMessageId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT,
    "pdfUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "returnNumber" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "saleId" TEXT,
    "patientId" TEXT,
    "returnReason" TEXT NOT NULL,
    "returnType" TEXT NOT NULL DEFAULT 'PATIENT_RETURN',
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "totalReturnAmount" DECIMAL(12,2) NOT NULL,
    "totalGstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundMethod" TEXT,
    "refundStatus" "ReturnRefundStatus" NOT NULL DEFAULT 'PENDING',
    "refundTransactionId" TEXT,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "fraudScore" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fraudFlags" TEXT[],
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "invoiceItemId" TEXT,
    "saleItemId" TEXT,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "returnedQuantity" INTEGER NOT NULL,
    "originalQuantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "returnAmount" DECIMAL(12,2) NOT NULL,
    "gstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "disposition" TEXT NOT NULL DEFAULT 'PENDING',
    "dispositionNotes" TEXT,
    "disposedBy" TEXT,
    "disposedAt" TIMESTAMP(3),

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "totalCreditAmount" DECIMAL(12,2) NOT NULL,
    "gstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cgstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAdjustment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionReference" VARCHAR(255),
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodAnalytics" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "paymentDate" DATE NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegisterSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "openingCash" DECIMAL(12,2) NOT NULL,
    "closingCash" DECIMAL(12,2),
    "expectedClosingCash" DECIMAL(12,2),
    "cashSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cashRefunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "variance" DECIMAL(12,2),
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegisterSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProcurementSummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "reportDate" DATE NOT NULL,
    "totalPurchased" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalInvoices" INTEGER NOT NULL DEFAULT 0,
    "totalReturns" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyProcurementSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeadLetter" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "failureReason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "resolution" TEXT,

    CONSTRAINT "NotificationDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryEvent" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "providerName" VARCHAR(100),
    "providerMessageId" VARCHAR(255),
    "errorMessage" TEXT,
    "eventTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" VARCHAR(255),
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "refillReminderDaysBefore" INTEGER NOT NULL DEFAULT 3,
    "appointmentReminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "expiryReminderDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "retryBackoffStrategy" VARCHAR(50) NOT NULL DEFAULT 'exponential',
    "criticalEscalationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "escalationTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxEscalationLevels" INTEGER NOT NULL DEFAULT 3,
    "maxNotificationsPerHour" INTEGER NOT NULL DEFAULT 100,
    "maxRemindersPerDay" INTEGER NOT NULL DEFAULT 5,
    "duplicateSuppressionMinutes" INTEGER NOT NULL DEFAULT 60,
    "respectOptOuts" BOOLEAN NOT NULL DEFAULT true,
    "consentRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultFallbackChannel" VARCHAR(50) NOT NULL DEFAULT 'email',
    "updatedBy" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannelConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settingsId" TEXT,
    "channelType" VARCHAR(50) NOT NULL,
    "providerName" VARCHAR(100) NOT NULL,
    "providerConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER,
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationChannelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settingsId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "triggerType" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerCondition" JSONB NOT NULL,
    "escalationChain" JSONB NOT NULL,
    "appliesTo" VARCHAR(50) NOT NULL DEFAULT 'all',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "condition" JSONB NOT NULL,
    "notifyRoles" JSONB NOT NULL,
    "notifyChannels" JSONB NOT NULL,
    "templateKey" VARCHAR(255),
    "autoRepeatMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settingsId" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "reminderType" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "offsetDays" INTEGER NOT NULL,
    "offsetHours" INTEGER NOT NULL DEFAULT 0,
    "channels" JSONB NOT NULL,
    "templateKey" VARCHAR(255),
    "patientFilter" JSONB,
    "medicineFilter" JSONB,
    "maxPerDay" INTEGER NOT NULL DEFAULT 1,
    "cooldownHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationOptOut" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT,
    "userId" TEXT,
    "phoneNumber" VARCHAR(20),
    "email" VARCHAR(255),
    "channel" VARCHAR(50),
    "reminderType" VARCHAR(50),
    "reason" VARCHAR(255),
    "optedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "optedOutBy" VARCHAR(255),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CommunicationOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRetryLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" VARCHAR(255),
    "originalChannel" VARCHAR(50) NOT NULL,
    "retryAttempt" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "status" "NotificationRetryStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "scheduledVia" VARCHAR(50) NOT NULL DEFAULT 'bullmq',
    "movedToDLQAt" TIMESTAMP(3),
    "dlqReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRetryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientBehavior" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicineId" TEXT,
    "purchaseFrequency" INTEGER NOT NULL DEFAULT 0,
    "averagePurchaseInterval" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lastPurchaseDate" TIMESTAMP(3),
    "adherenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientBehavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientSegment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "segmentName" VARCHAR(100) NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientLoyaltyAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "loyaltyTier" "LoyaltyTier" NOT NULL DEFAULT 'BRONZE',
    "availablePoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientLoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCreditAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "accountStatus" "CreditAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientCreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCreditLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "runningBalance" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "type" "CreditTransactionType" NOT NULL,

    CONSTRAINT "PatientCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRefill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "lastPurchaseDate" TIMESTAMP(3),
    "expectedRefillAt" TIMESTAMP(3),
    "dailyConsumption" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "adherenceStatus" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "lastReminderSent" TIMESTAMP(3),
    "reminderChannel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientRefill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAdherence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "refillId" TEXT NOT NULL,
    "adherenceScore" DECIMAL(5,2) NOT NULL,
    "adherenceStatus" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAdherence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientRefillReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "refillId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "channel" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientRefillReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientReminder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "reminderType" VARCHAR(50) NOT NULL,
    "frequency" TEXT,
    "reminderTime" TEXT,
    "nextReminderAt" TIMESTAMP(3),
    "reminderChannel" VARCHAR(50) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPrescription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "prescriptionUrl" TEXT NOT NULL,
    "prescriptionStatus" "PrescriptionUploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "verifiedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "category" TEXT NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "cgstPercentage" DECIMAL(5,2) NOT NULL,
    "sgstPercentage" DECIMAL(5,2) NOT NULL,
    "igstPercentage" DECIMAL(5,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstSettingVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gstSettingId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "cgstPercentage" DECIMAL(5,2) NOT NULL,
    "sgstPercentage" DECIMAL(5,2) NOT NULL,
    "igstPercentage" DECIMAL(5,2) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstSettingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT,
    "branchId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB NOT NULL,
    "changedBy" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingsAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "settingKey" TEXT NOT NULL,
    "category" TEXT,
    "branchId" TEXT,
    "proposedValue" JSONB NOT NULL,
    "proposedBy" TEXT,
    "status" "SettingsApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettingsApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineInventoryConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "branchId" TEXT,
    "reorderPoint" INTEGER NOT NULL,
    "safetyStock" INTEGER NOT NULL,
    "maxStockLimit" INTEGER NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineInventoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineStatusHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "oldStatus" "MedicineStatus",
    "newStatus" "MedicineStatus" NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicinePriceHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "oldMrp" DECIMAL(12,2),
    "newMrp" DECIMAL(12,2) NOT NULL,
    "oldSellingPrice" DECIMAL(12,2),
    "newSellingPrice" DECIMAL(12,2) NOT NULL,
    "oldPurchasePrice" DECIMAL(12,2),
    "newPurchasePrice" DECIMAL(12,2) NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicinePriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplateVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "templateConfig" JSONB NOT NULL,
    "templateName" TEXT,
    "templateType" TEXT,
    "changeReason" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "storeName" TEXT NOT NULL,
    "legalName" TEXT,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "drugLicenseNumber" TEXT,
    "drugLicenseExpiry" TIMESTAMP(3),
    "fssaiLicense" TEXT,
    "fssaiLicenseExpiry" TIMESTAMP(3),
    "phoneNumber" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "supportEmail" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "logoUrl" TEXT,
    "invoiceLogoUrl" TEXT,
    "whatsappLogoUrl" TEXT,
    "brandColor" TEXT,
    "tagline" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationDate" TIMESTAMP(3),
    "complianceNotes" TEXT,
    "status" "StoreProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProfileVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedBy" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProfileDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "branchId" TEXT,
    "documentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "uploadedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProfileDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProfileLocalization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "storeName" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "tagline" TEXT,
    "invoiceFooter" TEXT,

    CONSTRAINT "StoreProfileLocalization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "providerType" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderHealthLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "healthStatus" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderHealthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "snapshotType" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DashboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceCounter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sequenceType" VARCHAR(50) NOT NULL,
    "currentValue" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertSettings_tenantId_idx" ON "AlertSettings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertSettings_tenantId_branchId_key" ON "AlertSettings"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "AlertThresholdOverride_tenantId_idx" ON "AlertThresholdOverride"("tenantId");

-- CreateIndex
CREATE INDEX "AlertThresholdOverride_medicineId_idx" ON "AlertThresholdOverride"("medicineId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertThresholdOverride_alertSettingsId_medicineId_key" ON "AlertThresholdOverride"("alertSettingsId", "medicineId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_tenantId_idx" ON "PaymentAllocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIdempotency_idempotencyKey_key" ON "PaymentIdempotency"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIdempotency_expiresAt_idx" ON "PaymentIdempotency"("expiresAt");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_paymentId_idx" ON "PaymentAuditLog"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_tenantId_idx" ON "PaymentAuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentAuditLog_createdAt_idx" ON "PaymentAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhook_idempotencyKey_key" ON "PaymentWebhook"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentWebhook_event_idx" ON "PaymentWebhook"("event");

-- CreateIndex
CREATE INDEX "PaymentWebhook_processedAt_idx" ON "PaymentWebhook"("processedAt");

-- CreateIndex
CREATE INDEX "PaymentRecovery_paymentId_idx" ON "PaymentRecovery"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentRecovery_tenantId_idx" ON "PaymentRecovery"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentRecovery_recoveryType_idx" ON "PaymentRecovery"("recoveryType");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_tenantId_idx" ON "PaymentReconciliation"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_reconciledAt_idx" ON "PaymentReconciliation"("reconciledAt");

-- CreateIndex
CREATE INDEX "MedicinePricing_tenantId_medicineId_idx" ON "MedicinePricing"("tenantId", "medicineId");

-- CreateIndex
CREATE INDEX "DrugInteraction_tenantId_idx" ON "DrugInteraction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DrugInteraction_medicineId_interactsWithId_key" ON "DrugInteraction"("medicineId", "interactsWithId");

-- CreateIndex
CREATE INDEX "DrugAlternative_tenantId_idx" ON "DrugAlternative"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DrugAlternative_medicineId_alternativeId_key" ON "DrugAlternative"("medicineId", "alternativeId");

-- CreateIndex
CREATE INDEX "Inventory_medicineId_idx" ON "Inventory"("medicineId");

-- CreateIndex
CREATE INDEX "Inventory_tenantId_branchId_status_idx" ON "Inventory"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_tenantId_branchId_medicineId_key" ON "Inventory"("tenantId", "branchId", "medicineId");

-- CreateIndex
CREATE INDEX "BatchAuditLog_batchId_idx" ON "BatchAuditLog"("batchId");

-- CreateIndex
CREATE INDEX "BatchAuditLog_tenantId_idx" ON "BatchAuditLog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_medicineId_createdAt_idx" ON "StockMovement"("medicineId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_paymentId_idx" ON "SupplierPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_purchaseInvoiceId_idx" ON "SupplierPaymentAllocation"("purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseOrderApproval_purchaseOrderId_idx" ON "PurchaseOrderApproval"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceiptNote_tenantId_purchaseOrderId_idx" ON "GoodsReceiptNote"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiptNote_tenantId_grnNumber_key" ON "GoodsReceiptNote"("tenantId", "grnNumber");

-- CreateIndex
CREATE INDEX "Patient_tenantId_phone_idx" ON "Patient"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_patientCode_key" ON "Patient"("tenantId", "patientCode");

-- CreateIndex
CREATE INDEX "PatientAuditLog_tenantId_patientId_performedAt_idx" ON "PatientAuditLog"("tenantId", "patientId", "performedAt");

-- CreateIndex
CREATE INDEX "PatientAuditLog_tenantId_action_idx" ON "PatientAuditLog"("tenantId", "action");

-- CreateIndex
CREATE INDEX "PatientInsuranceClaim_prescriptionId_idx" ON "PatientInsuranceClaim"("prescriptionId");

-- CreateIndex
CREATE INDEX "PatientInsuranceClaim_tenantId_idx" ON "PatientInsuranceClaim"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientInsuranceClaim_tenantId_claimNumber_key" ON "PatientInsuranceClaim"("tenantId", "claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FileAsset_storageKey_key" ON "FileAsset"("storageKey");

-- CreateIndex
CREATE INDEX "FileAsset_tenantId_status_idx" ON "FileAsset"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FileAsset_prescriptionId_idx" ON "FileAsset"("prescriptionId");

-- CreateIndex
CREATE INDEX "FileAsset_invoiceId_idx" ON "FileAsset"("invoiceId");

-- CreateIndex
CREATE INDEX "FileAsset_patientId_idx" ON "FileAsset"("patientId");

-- CreateIndex
CREATE INDEX "ImportJob_tenantId_createdAt_idx" ON "ImportJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportExtractedItem_importJobId_idx" ON "ImportExtractedItem"("importJobId");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_idx" ON "InvoiceEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceAuditLog_invoiceId_idx" ON "InvoiceAuditLog"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePrintJob_invoiceId_idx" ON "InvoicePrintJob"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePrintJob_tenantId_idx" ON "InvoicePrintJob"("tenantId");

-- CreateIndex
CREATE INDEX "InvoicePrintJob_printStatus_idx" ON "InvoicePrintJob"("printStatus");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryLog_invoiceId_idx" ON "InvoiceDeliveryLog"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryLog_tenantId_idx" ON "InvoiceDeliveryLog"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryLog_deliveryChannel_idx" ON "InvoiceDeliveryLog"("deliveryChannel");

-- CreateIndex
CREATE INDEX "InvoiceDeliveryLog_deliveryStatus_idx" ON "InvoiceDeliveryLog"("deliveryStatus");

-- CreateIndex
CREATE INDEX "Return_tenantId_createdAt_idx" ON "Return"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Return_invoiceId_idx" ON "Return"("invoiceId");

-- CreateIndex
CREATE INDEX "Return_status_idx" ON "Return"("status");

-- CreateIndex
CREATE INDEX "Return_tenantId_status_idx" ON "Return"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Return_tenantId_returnNumber_key" ON "Return"("tenantId", "returnNumber");

-- CreateIndex
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "ReturnItem_medicineId_idx" ON "ReturnItem"("medicineId");

-- CreateIndex
CREATE INDEX "ReturnItem_batchId_idx" ON "ReturnItem"("batchId");

-- CreateIndex
CREATE INDEX "CreditNote_tenantId_createdAt_idx" ON "CreditNote"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditNote_returnId_idx" ON "CreditNote"("returnId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_tenantId_creditNoteNumber_key" ON "CreditNote"("tenantId", "creditNoteNumber");

-- CreateIndex
CREATE INDEX "RefundPayment_returnId_idx" ON "RefundPayment"("returnId");

-- CreateIndex
CREATE INDEX "RefundPayment_invoiceId_idx" ON "RefundPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "RefundPayment_tenantId_createdAt_idx" ON "RefundPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodAnalytics_tenantId_branchId_paymentDate_paymen_key" ON "PaymentMethodAnalytics"("tenantId", "branchId", "paymentDate", "paymentMethod");

-- CreateIndex
CREATE INDEX "CashRegisterSession_tenantId_branchId_idx" ON "CashRegisterSession"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "CashRegisterSession_cashierId_status_idx" ON "CashRegisterSession"("cashierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProcurementSummary_tenantId_branchId_reportDate_key" ON "DailyProcurementSummary"("tenantId", "branchId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeadLetter_notificationId_key" ON "NotificationDeadLetter"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDeadLetter_tenantId_idx" ON "NotificationDeadLetter"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationDeadLetter_movedAt_idx" ON "NotificationDeadLetter"("movedAt");

-- CreateIndex
CREATE INDEX "NotificationDeliveryEvent_notificationId_idx" ON "NotificationDeliveryEvent"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryEvent_eventType_idx" ON "NotificationDeliveryEvent"("eventType");

-- CreateIndex
CREATE INDEX "NotificationDeliveryEvent_eventTimestamp_idx" ON "NotificationDeliveryEvent"("eventTimestamp");

-- CreateIndex
CREATE INDEX "NotificationSettings_tenantId_idx" ON "NotificationSettings"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationSettings_tenantId_branchId_idx" ON "NotificationSettings"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationSettings_tenantId_branchId_key" ON "NotificationSettings"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "NotificationChannelConfig_tenantId_channelType_idx" ON "NotificationChannelConfig"("tenantId", "channelType");

-- CreateIndex
CREATE INDEX "NotificationChannelConfig_tenantId_isActive_idx" ON "NotificationChannelConfig"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationChannelConfig_tenantId_channelType_providerName_key" ON "NotificationChannelConfig"("tenantId", "channelType", "providerName");

-- CreateIndex
CREATE INDEX "EscalationPolicy_tenantId_isActive_idx" ON "EscalationPolicy"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "EscalationPolicy_tenantId_triggerType_idx" ON "EscalationPolicy"("tenantId", "triggerType");

-- CreateIndex
CREATE INDEX "EscalationRule_policyId_idx" ON "EscalationRule"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationRule_policyId_level_key" ON "EscalationRule"("policyId", "level");

-- CreateIndex
CREATE INDEX "ReminderRule_tenantId_reminderType_isActive_idx" ON "ReminderRule"("tenantId", "reminderType", "isActive");

-- CreateIndex
CREATE INDEX "ReminderRule_tenantId_isActive_idx" ON "ReminderRule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "CommunicationOptOut_tenantId_patientId_idx" ON "CommunicationOptOut"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "CommunicationOptOut_tenantId_phoneNumber_idx" ON "CommunicationOptOut"("tenantId", "phoneNumber");

-- CreateIndex
CREATE INDEX "CommunicationOptOut_tenantId_email_idx" ON "CommunicationOptOut"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationOptOut_tenantId_phoneNumber_channel_reminderTy_key" ON "CommunicationOptOut"("tenantId", "phoneNumber", "channel", "reminderType");

-- CreateIndex
CREATE INDEX "NotificationRetryLog_tenantId_status_idx" ON "NotificationRetryLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NotificationRetryLog_tenantId_nextRetryAt_idx" ON "NotificationRetryLog"("tenantId", "nextRetryAt");

-- CreateIndex
CREATE INDEX "NotificationRetryLog_tenantId_movedToDLQAt_idx" ON "NotificationRetryLog"("tenantId", "movedToDLQAt");

-- CreateIndex
CREATE INDEX "PatientBehavior_tenantId_patientId_idx" ON "PatientBehavior"("tenantId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientBehavior_tenantId_patientId_medicineId_key" ON "PatientBehavior"("tenantId", "patientId", "medicineId");

-- CreateIndex
CREATE INDEX "PatientSegment_patientId_idx" ON "PatientSegment"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientSegment_patientId_segmentName_key" ON "PatientSegment"("patientId", "segmentName");

-- CreateIndex
CREATE UNIQUE INDEX "PatientLoyaltyAccount_patientId_key" ON "PatientLoyaltyAccount"("patientId");

-- CreateIndex
CREATE INDEX "PatientLoyaltyAccount_tenantId_patientId_idx" ON "PatientLoyaltyAccount"("tenantId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientCreditAccount_patientId_key" ON "PatientCreditAccount"("patientId");

-- CreateIndex
CREATE INDEX "PatientCreditAccount_tenantId_patientId_idx" ON "PatientCreditAccount"("tenantId", "patientId");

-- CreateIndex
CREATE INDEX "PatientCreditLedger_patientId_createdAt_idx" ON "PatientCreditLedger"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "PatientCreditLedger_tenantId_idx" ON "PatientCreditLedger"("tenantId");

-- CreateIndex
CREATE INDEX "PatientRefill_tenantId_expectedRefillAt_idx" ON "PatientRefill"("tenantId", "expectedRefillAt");

-- CreateIndex
CREATE INDEX "PatientRefill_tenantId_adherenceStatus_idx" ON "PatientRefill"("tenantId", "adherenceStatus");

-- CreateIndex
CREATE INDEX "PatientRefill_patientId_idx" ON "PatientRefill"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientRefill_tenantId_patientId_medicineId_key" ON "PatientRefill"("tenantId", "patientId", "medicineId");

-- CreateIndex
CREATE INDEX "PatientAdherence_patientId_medicineId_idx" ON "PatientAdherence"("patientId", "medicineId");

-- CreateIndex
CREATE INDEX "PatientAdherence_tenantId_calculatedAt_idx" ON "PatientAdherence"("tenantId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PatientRefillReminder_patientId_scheduledAt_idx" ON "PatientRefillReminder"("patientId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PatientRefillReminder_deliveryStatus_scheduledAt_idx" ON "PatientRefillReminder"("deliveryStatus", "scheduledAt");

-- CreateIndex
CREATE INDEX "PatientReminder_patientId_idx" ON "PatientReminder"("patientId");

-- CreateIndex
CREATE INDEX "PatientReminder_tenantId_nextReminderAt_idx" ON "PatientReminder"("tenantId", "nextReminderAt");

-- CreateIndex
CREATE INDEX "PatientReminder_tenantId_status_nextReminderAt_idx" ON "PatientReminder"("tenantId", "status", "nextReminderAt");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE INDEX "AccessRole_tenantId_idx" ON "AccessRole"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_tenantId_name_key" ON "AccessRole"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "PatientPrescription_patientId_idx" ON "PatientPrescription"("patientId");

-- CreateIndex
CREATE INDEX "GstSetting_tenantId_isActive_idx" ON "GstSetting"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "GstSetting_tenantId_category_idx" ON "GstSetting"("tenantId", "category");

-- CreateIndex
CREATE INDEX "GstSetting_branchId_idx" ON "GstSetting"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "GstSetting_tenantId_branchId_category_effectiveFrom_key" ON "GstSetting"("tenantId", "branchId", "category", "effectiveFrom");

-- CreateIndex
CREATE INDEX "GstSettingVersion_tenantId_gstSettingId_idx" ON "GstSettingVersion"("tenantId", "gstSettingId");

-- CreateIndex
CREATE INDEX "GstSettingVersion_tenantId_category_idx" ON "GstSettingVersion"("tenantId", "category");

-- CreateIndex
CREATE INDEX "SettingsAuditLog_tenantId_settingKey_createdAt_idx" ON "SettingsAuditLog"("tenantId", "settingKey", "createdAt");

-- CreateIndex
CREATE INDEX "SettingsAuditLog_tenantId_changedBy_idx" ON "SettingsAuditLog"("tenantId", "changedBy");

-- CreateIndex
CREATE INDEX "SettingsAuditLog_branchId_idx" ON "SettingsAuditLog"("branchId");

-- CreateIndex
CREATE INDEX "SettingsApproval_tenantId_status_idx" ON "SettingsApproval"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SettingsApproval_tenantId_settingKey_idx" ON "SettingsApproval"("tenantId", "settingKey");

-- CreateIndex
CREATE INDEX "MedicineInventoryConfig_tenantId_medicineId_branchId_idx" ON "MedicineInventoryConfig"("tenantId", "medicineId", "branchId");

-- CreateIndex
CREATE INDEX "MedicineStatusHistory_tenantId_medicineId_idx" ON "MedicineStatusHistory"("tenantId", "medicineId");

-- CreateIndex
CREATE INDEX "MedicinePriceHistory_tenantId_medicineId_idx" ON "MedicinePriceHistory"("tenantId", "medicineId");

-- CreateIndex
CREATE INDEX "InvoiceTemplateVersion_tenantId_idx" ON "InvoiceTemplateVersion"("tenantId");

-- CreateIndex
CREATE INDEX "InvoiceTemplateVersion_tenantId_versionNumber_idx" ON "InvoiceTemplateVersion"("tenantId", "versionNumber");

-- CreateIndex
CREATE INDEX "StoreProfile_tenantId_status_idx" ON "StoreProfile"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StoreProfile_tenantId_gstin_idx" ON "StoreProfile"("tenantId", "gstin");

-- CreateIndex
CREATE INDEX "StoreProfile_branchId_idx" ON "StoreProfile"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProfile_tenantId_branchId_key" ON "StoreProfile"("tenantId", "branchId");

-- CreateIndex
CREATE INDEX "StoreProfileVersion_tenantId_profileId_idx" ON "StoreProfileVersion"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "StoreProfileVersion_tenantId_profileId_versionNumber_idx" ON "StoreProfileVersion"("tenantId", "profileId", "versionNumber");

-- CreateIndex
CREATE INDEX "StoreProfileDocument_tenantId_profileId_idx" ON "StoreProfileDocument"("tenantId", "profileId");

-- CreateIndex
CREATE INDEX "StoreProfileDocument_tenantId_documentType_idx" ON "StoreProfileDocument"("tenantId", "documentType");

-- CreateIndex
CREATE INDEX "StoreProfileDocument_branchId_idx" ON "StoreProfileDocument"("branchId");

-- CreateIndex
CREATE INDEX "StoreProfileLocalization_tenantId_language_idx" ON "StoreProfileLocalization"("tenantId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProfileLocalization_tenantId_profileId_language_key" ON "StoreProfileLocalization"("tenantId", "profileId", "language");

-- CreateIndex
CREATE INDEX "IntegrationProvider_tenantId_idx" ON "IntegrationProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProvider_tenantId_branchId_providerType_provider_key" ON "IntegrationProvider"("tenantId", "branchId", "providerType", "providerName");

-- CreateIndex
CREATE INDEX "ProviderHealthLog_tenantId_idx" ON "ProviderHealthLog"("tenantId");

-- CreateIndex
CREATE INDEX "ProviderHealthLog_checkedAt_idx" ON "ProviderHealthLog"("checkedAt");

-- CreateIndex
CREATE INDEX "DashboardSnapshot_tenantId_snapshotType_isValid_idx" ON "DashboardSnapshot"("tenantId", "snapshotType", "isValid");

-- CreateIndex
CREATE INDEX "DashboardSnapshot_tenantId_branchId_snapshotType_idx" ON "DashboardSnapshot"("tenantId", "branchId", "snapshotType");

-- CreateIndex
CREATE INDEX "DashboardSnapshot_expiresAt_idx" ON "DashboardSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "SequenceCounter_tenantId_idx" ON "SequenceCounter"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceCounter_tenantId_sequenceType_key" ON "SequenceCounter"("tenantId", "sequenceType");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DailySalesSummary_tenantId_branchId_salesDate_key" ON "DailySalesSummary"("tenantId", "branchId", "salesDate");

-- CreateIndex
CREATE INDEX "Delivery_tenantId_deliveryStatus_idx" ON "Delivery"("tenantId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "ExpiryAlert_tenantId_alertStatus_idx" ON "ExpiryAlert"("tenantId", "alertStatus");

-- CreateIndex
CREATE INDEX "ExpiryAlert_tenantId_isResolved_idx" ON "ExpiryAlert"("tenantId", "isResolved");

-- CreateIndex
CREATE INDEX "ExpiryAlert_branchId_alertStatus_idx" ON "ExpiryAlert"("branchId", "alertStatus");

-- CreateIndex
CREATE INDEX "ExpiryAlert_severity_alertStatus_idx" ON "ExpiryAlert"("severity", "alertStatus");

-- CreateIndex
CREATE INDEX "ExpiryAlert_daysRemaining_idx" ON "ExpiryAlert"("daysRemaining");

-- CreateIndex
CREATE INDEX "InventoryBatch_status_idx" ON "InventoryBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBatch_tenantId_branchId_medicineId_batchNumber_key" ON "InventoryBatch"("tenantId", "branchId", "medicineId", "batchNumber");

-- CreateIndex
CREATE INDEX "InventorySyncLog_tenantId_syncStatus_idx" ON "InventorySyncLog"("tenantId", "syncStatus");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_invoiceNumber_key" ON "Invoice"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_batchId_idx" ON "InvoiceItem"("batchId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_patientId_idx" ON "LoyaltyTransaction"("patientId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_idx" ON "LoyaltyTransaction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_sku_key" ON "Medicine"("sku");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_status_idx" ON "Medicine"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_categoryId_idx" ON "Medicine"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_dosageForm_idx" ON "Medicine"("tenantId", "dosageForm");

-- CreateIndex
CREATE INDEX "Medicine_tenantId_scheduleType_idx" ON "Medicine"("tenantId", "scheduleType");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_tenantId_barcode_key" ON "Medicine"("tenantId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineBarcode_tenantId_barcode_key" ON "MedicineBarcode"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "MedicineSubscription_tenantId_subscriptionStatus_idx" ON "MedicineSubscription"("tenantId", "subscriptionStatus");

-- CreateIndex
CREATE INDEX "MedicineSubscription_patientId_idx" ON "MedicineSubscription"("patientId");

-- CreateIndex
CREATE INDEX "MedicineSupplier_tenantId_idx" ON "MedicineSupplier"("tenantId");

-- CreateIndex
CREATE INDEX "MedicineSupplier_supplierId_isPreferred_idx" ON "MedicineSupplier"("supplierId", "isPreferred");

-- CreateIndex
CREATE INDEX "MedicineSupplier_medicineId_lastPurchasePrice_idx" ON "MedicineSupplier"("medicineId", "lastPurchasePrice");

-- CreateIndex
CREATE INDEX "Notification_tenantId_deliveryStatus_idx" ON "Notification"("tenantId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "OnlineOrder_tenantId_orderStatus_idx" ON "OnlineOrder"("tenantId", "orderStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAdmission_tenantId_admissionNumber_key" ON "PatientAdmission"("tenantId", "admissionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKeyHash_key" ON "Payment"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_idempotencyKeyHash_idx" ON "Payment"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "Payment_correlationId_idx" ON "Payment"("correlationId");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Prescription_patientId_idx" ON "Prescription"("patientId");

-- CreateIndex
CREATE INDEX "Prescription_verificationStatus_idx" ON "Prescription"("verificationStatus");

-- CreateIndex
CREATE INDEX "Prescription_status_idx" ON "Prescription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_tenantId_prescriptionNumber_key" ON "Prescription"("tenantId", "prescriptionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_tenantId_orderNumber_key" ON "PurchaseOrder"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "Rider_tenantId_currentStatus_idx" ON "Rider"("tenantId", "currentStatus");

-- CreateIndex
CREATE INDEX "SmsNotification_tenantId_status_idx" ON "SmsNotification"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StockAlert_tenantId_alertStatus_idx" ON "StockAlert"("tenantId", "alertStatus");

-- CreateIndex
CREATE INDEX "StockAlert_branchId_alertStatus_idx" ON "StockAlert"("branchId", "alertStatus");

-- CreateIndex
CREATE INDEX "StockAlert_severity_alertStatus_idx" ON "StockAlert"("severity", "alertStatus");

-- CreateIndex
CREATE INDEX "StockAlert_snoozedUntil_idx" ON "StockAlert"("snoozedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_tenantId_transferNumber_key" ON "StockTransfer"("tenantId", "transferNumber");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_supplierType_idx" ON "Supplier"("tenantId", "supplierType");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_status_idx" ON "Supplier"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_isPreferred_idx" ON "Supplier"("tenantId", "isPreferred");

-- CreateIndex
CREATE INDEX "Supplier_licenseExpiry_idx" ON "Supplier"("licenseExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_gstNumber_key" ON "Supplier"("tenantId", "gstNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_supplierCode_key" ON "Supplier"("tenantId", "supplierCode");

-- CreateIndex
CREATE INDEX "SupplierMetrics_supplierId_qualityScore_idx" ON "SupplierMetrics"("supplierId", "qualityScore");

-- CreateIndex
CREATE INDEX "SupplierMetrics_supplierId_fulfillmentRate_idx" ON "SupplierMetrics"("supplierId", "fulfillmentRate");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_idx" ON "Transaction"("tenantId");

-- CreateIndex
CREATE INDEX "Transaction_correlationId_idx" ON "Transaction"("correlationId");

-- CreateIndex
CREATE INDEX "Transaction_idempotencyKey_idx" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshToken_key" ON "UserSession"("refreshToken");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSettings" ADD CONSTRAINT "AlertSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertThresholdOverride" ADD CONSTRAINT "AlertThresholdOverride_alertSettingsId_fkey" FOREIGN KEY ("alertSettingsId") REFERENCES "AlertSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertThresholdOverride" ADD CONSTRAINT "AlertThresholdOverride_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertThresholdOverride" ADD CONSTRAINT "AlertThresholdOverride_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertThresholdOverride" ADD CONSTRAINT "AlertThresholdOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuditLog" ADD CONSTRAINT "PaymentAuditLog_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePricing" ADD CONSTRAINT "MedicinePricing_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePricing" ADD CONSTRAINT "MedicinePricing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_interactsWithId_fkey" FOREIGN KEY ("interactsWithId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugInteraction" ADD CONSTRAINT "DrugInteraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugAlternative" ADD CONSTRAINT "DrugAlternative_alternativeId_fkey" FOREIGN KEY ("alternativeId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugAlternative" ADD CONSTRAINT "DrugAlternative_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrugAlternative" ADD CONSTRAINT "DrugAlternative_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAuditLog" ADD CONSTRAINT "BatchAuditLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAuditLog" ADD CONSTRAINT "BatchAuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchAuditLog" ADD CONSTRAINT "BatchAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAlert" ADD CONSTRAINT "StockAlert_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpiryAlert" ADD CONSTRAINT "ExpiryAlert_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSupplier" ADD CONSTRAINT "MedicineSupplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderApproval" ADD CONSTRAINT "PurchaseOrderApproval_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderApproval" ADD CONSTRAINT "PurchaseOrderApproval_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNote" ADD CONSTRAINT "GoodsReceiptNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNoteItem" ADD CONSTRAINT "GoodsReceiptNoteItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceiptNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptNoteItem" ADD CONSTRAINT "GoodsReceiptNoteItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAuditLog" ADD CONSTRAINT "PatientAuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAuditLog" ADD CONSTRAINT "PatientAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsNotification" ADD CONSTRAINT "SmsNotification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsuranceClaim" ADD CONSTRAINT "PatientInsuranceClaim_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsuranceClaim" ADD CONSTRAINT "PatientInsuranceClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportExtractedItem" ADD CONSTRAINT "ImportExtractedItem_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportExtractedItem" ADD CONSTRAINT "ImportExtractedItem_matchedMedicineId_fkey" FOREIGN KEY ("matchedMedicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceAuditLog" ADD CONSTRAINT "InvoiceAuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePrintJob" ADD CONSTRAINT "InvoicePrintJob_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePrintJob" ADD CONSTRAINT "InvoicePrintJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDeliveryLog" ADD CONSTRAINT "InvoiceDeliveryLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDeliveryLog" ADD CONSTRAINT "InvoiceDeliveryLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySalesSummary" ADD CONSTRAINT "DailySalesSummary_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodAnalytics" ADD CONSTRAINT "PaymentMethodAnalytics_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodAnalytics" ADD CONSTRAINT "PaymentMethodAnalytics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "CashRegisterSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "CashRegisterSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterSession" ADD CONSTRAINT "CashRegisterSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProcurementSummary" ADD CONSTRAINT "DailyProcurementSummary_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProcurementSummary" ADD CONSTRAINT "DailyProcurementSummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeadLetter" ADD CONSTRAINT "NotificationDeadLetter_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryEvent" ADD CONSTRAINT "NotificationDeliveryEvent_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannelConfig" ADD CONSTRAINT "NotificationChannelConfig_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "NotificationSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannelConfig" ADD CONSTRAINT "NotificationChannelConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationPolicy" ADD CONSTRAINT "EscalationPolicy_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "NotificationSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationPolicy" ADD CONSTRAINT "EscalationPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRule" ADD CONSTRAINT "EscalationRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "EscalationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "NotificationSettings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationOptOut" ADD CONSTRAINT "CommunicationOptOut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRetryLog" ADD CONSTRAINT "NotificationRetryLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientBehavior" ADD CONSTRAINT "PatientBehavior_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientBehavior" ADD CONSTRAINT "PatientBehavior_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientBehavior" ADD CONSTRAINT "PatientBehavior_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientSegment" ADD CONSTRAINT "PatientSegment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLoyaltyAccount" ADD CONSTRAINT "PatientLoyaltyAccount_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLoyaltyAccount" ADD CONSTRAINT "PatientLoyaltyAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCreditAccount" ADD CONSTRAINT "PatientCreditAccount_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCreditAccount" ADD CONSTRAINT "PatientCreditAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCreditLedger" ADD CONSTRAINT "PatientCreditLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PatientCreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientCreditLedger" ADD CONSTRAINT "PatientCreditLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefill" ADD CONSTRAINT "PatientRefill_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefill" ADD CONSTRAINT "PatientRefill_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefill" ADD CONSTRAINT "PatientRefill_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAdherence" ADD CONSTRAINT "PatientAdherence_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAdherence" ADD CONSTRAINT "PatientAdherence_refillId_fkey" FOREIGN KEY ("refillId") REFERENCES "PatientRefill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAdherence" ADD CONSTRAINT "PatientAdherence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefillReminder" ADD CONSTRAINT "PatientRefillReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefillReminder" ADD CONSTRAINT "PatientRefillReminder_refillId_fkey" FOREIGN KEY ("refillId") REFERENCES "PatientRefill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientRefillReminder" ADD CONSTRAINT "PatientRefillReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientReminder" ADD CONSTRAINT "PatientReminder_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientReminder" ADD CONSTRAINT "PatientReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientReminder" ADD CONSTRAINT "PatientReminder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineSubscription" ADD CONSTRAINT "MedicineSubscription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientIdentityMap" ADD CONSTRAINT "PatientIdentityMap_internalPatientId_fkey" FOREIGN KEY ("internalPatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRole" ADD CONSTRAINT "AccessRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPrescription" ADD CONSTRAINT "PatientPrescription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstSetting" ADD CONSTRAINT "GstSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstSetting" ADD CONSTRAINT "GstSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstSettingVersion" ADD CONSTRAINT "GstSettingVersion_gstSettingId_fkey" FOREIGN KEY ("gstSettingId") REFERENCES "GstSetting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstSettingVersion" ADD CONSTRAINT "GstSettingVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsAuditLog" ADD CONSTRAINT "SettingsAuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsAuditLog" ADD CONSTRAINT "SettingsAuditLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsAuditLog" ADD CONSTRAINT "SettingsAuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsApproval" ADD CONSTRAINT "SettingsApproval_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsApproval" ADD CONSTRAINT "SettingsApproval_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingsApproval" ADD CONSTRAINT "SettingsApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineInventoryConfig" ADD CONSTRAINT "MedicineInventoryConfig_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineInventoryConfig" ADD CONSTRAINT "MedicineInventoryConfig_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineInventoryConfig" ADD CONSTRAINT "MedicineInventoryConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineInventoryConfig" ADD CONSTRAINT "MedicineInventoryConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineStatusHistory" ADD CONSTRAINT "MedicineStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineStatusHistory" ADD CONSTRAINT "MedicineStatusHistory_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineStatusHistory" ADD CONSTRAINT "MedicineStatusHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePriceHistory" ADD CONSTRAINT "MedicinePriceHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePriceHistory" ADD CONSTRAINT "MedicinePriceHistory_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicinePriceHistory" ADD CONSTRAINT "MedicinePriceHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTemplateVersion" ADD CONSTRAINT "InvoiceTemplateVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfile" ADD CONSTRAINT "StoreProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfile" ADD CONSTRAINT "StoreProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileVersion" ADD CONSTRAINT "StoreProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileVersion" ADD CONSTRAINT "StoreProfileVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileDocument" ADD CONSTRAINT "StoreProfileDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileDocument" ADD CONSTRAINT "StoreProfileDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileDocument" ADD CONSTRAINT "StoreProfileDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileLocalization" ADD CONSTRAINT "StoreProfileLocalization_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProfileLocalization" ADD CONSTRAINT "StoreProfileLocalization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationProvider" ADD CONSTRAINT "IntegrationProvider_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationProvider" ADD CONSTRAINT "IntegrationProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderHealthLog" ADD CONSTRAINT "ProviderHealthLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardSnapshot" ADD CONSTRAINT "DashboardSnapshot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardSnapshot" ADD CONSTRAINT "DashboardSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
