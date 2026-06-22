-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING', 'READY_TO_SEND', 'SENT_TO_SUPPLIER', 'RECEIVED_BY_SUPPLIER', 'CREDIT_NOTE_RECEIVED');

-- AlterTable: Add dispatchStatus and audit timestamp columns to SupplierReturn
ALTER TABLE "SupplierReturn" ADD COLUMN "dispatchStatus" "DispatchStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "SupplierReturn" ADD COLUMN "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "SupplierReturn" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "SupplierReturn" ADD COLUMN "creditReceivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupplierReturn_dispatchStatus_idx" ON "SupplierReturn"("dispatchStatus");
