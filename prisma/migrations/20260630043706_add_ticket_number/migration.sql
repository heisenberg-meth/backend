/*
  Warnings:

  - You are about to drop the column `twoFactorEnabled` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorMethod` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorSecret` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `UserBackupCode` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ticketNumber` to the `SupportTicket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RefundPayment" DROP CONSTRAINT "RefundPayment_returnId_fkey";

-- DropForeignKey
ALTER TABLE "UserBackupCode" DROP CONSTRAINT "UserBackupCode_userId_fkey";

-- AlterTable
ALTER TABLE "RefundPayment" ALTER COLUMN "returnId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "ticketNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "twoFactorEnabled",
DROP COLUMN "twoFactorMethod",
DROP COLUMN "twoFactorSecret";

-- DropTable
DROP TABLE "UserBackupCode";

-- DropEnum
DROP TYPE "TwoFactorMethod";

-- AddForeignKey
ALTER TABLE "RefundPayment" ADD CONSTRAINT "RefundPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE SET NULL ON UPDATE CASCADE;
