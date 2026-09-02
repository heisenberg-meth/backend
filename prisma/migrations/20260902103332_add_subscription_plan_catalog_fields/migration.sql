-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxBatches" INTEGER,
ADD COLUMN     "maxBranches" INTEGER,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "trialDays" INTEGER;
