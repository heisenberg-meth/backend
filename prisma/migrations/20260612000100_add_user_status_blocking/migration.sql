-- Create UserStatus enum type
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');

-- Add status column to User table with default ACTIVE
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS "idx_user_status" ON "User"("status");
CREATE INDEX IF NOT EXISTS "idx_user_status_tenant" ON "User"("tenantId", "status");

-- Update all existing users to ACTIVE
UPDATE "User" SET "status" = 'ACTIVE' WHERE "status" IS NULL AND "deletedAt" IS NULL;

-- Update migration tracking
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES (
  'add-user-status-blocking',
  md5(''),
  NOW(),
  '20260612000100_add_user_status_blocking',
  '',
  NULL,
  NOW(),
  1
) ON CONFLICT ("id") DO NOTHING;
