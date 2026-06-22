-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('PENDING', 'CHECKOUT_OPENED', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_EXPIRED', 'WEBHOOK_VERIFIED', 'SUBSCRIPTION_ACTIVATED');

-- AlterEnum (add PAYMENT and SUBSCRIPTION to AuditLogType)
ALTER TYPE "AuditLogType" ADD VALUE IF NOT EXISTS 'PAYMENT';
ALTER TYPE "AuditLogType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "paymentSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionPlanId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "state" TEXT NOT NULL,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_paymentSessionId_key" ON "PaymentSession"("paymentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_razorpayOrderId_key" ON "PaymentSession"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "PaymentSession_tenantId_idx" ON "PaymentSession"("tenantId");

-- CreateIndex
CREATE INDEX "PaymentSession_userId_idx" ON "PaymentSession"("userId");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentSessionId_idx" ON "PaymentSession"("paymentSessionId");

-- CreateIndex
CREATE INDEX "PaymentSession_razorpayOrderId_idx" ON "PaymentSession"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "PaymentSession_status_idx" ON "PaymentSession"("status");

-- CreateIndex
CREATE INDEX "PaymentSession_expiresAt_idx" ON "PaymentSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PaymentSession_createdAt_idx" ON "PaymentSession"("createdAt");

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_subscriptionPlanId_fkey" FOREIGN KEY ("subscriptionPlanId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Subscription"("tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
