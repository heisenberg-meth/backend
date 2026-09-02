-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "alertEmail" VARCHAR(255);

-- AlterTable
ALTER TABLE "SupplierReturnItem" ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
