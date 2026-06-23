-- Support Schema Reconciliation
-- Removes duplicate support architecture and standardizes on production tables.
-- Production has: SupportTicket, SupportTicketReply, SupportTicketStatus, SupportTicketPriority
-- The broken migration 20260623100000 tried to create: SupportMessage, SupportAttachment, TicketStatus, TicketPriority
-- Step 1: Drop tables that should never have been created (if they exist)
DROP TABLE IF EXISTS "SupportAttachment" CASCADE;
DROP TABLE IF EXISTS "SupportAuditLog" CASCADE;
DROP TABLE IF EXISTS "SupportMessage" CASCADE;
-- Step 2: Drop enums that should never have been created (if they exist)
DO $$ BEGIN DROP TYPE IF EXISTS "TicketCategory";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN DROP TYPE IF EXISTS "TicketPriority";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN DROP TYPE IF EXISTS "TicketStatus";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
-- Step 3: Ensure the correct enums exist with all needed values
-- Add CRITICAL to SupportTicketPriority if not present
DO $$ BEGIN ALTER TYPE "SupportTicketPriority"
ADD VALUE IF NOT EXISTS 'CRITICAL';
EXCEPTION
WHEN OTHERS THEN null;
END $$;
-- Add WAITING_FOR_STAFF to SupportTicketStatus if not present
DO $$ BEGIN ALTER TYPE "SupportTicketStatus"
ADD VALUE IF NOT EXISTS 'WAITING_FOR_STAFF';
EXCEPTION
WHEN OTHERS THEN null;
END $$;
-- Step 4: Ensure SupportTicketReply table exists (production should already have it)
CREATE TABLE IF NOT EXISTS "SupportTicketReply" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "authorRole" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketReply_pkey" PRIMARY KEY ("id")
);
-- Step 5: Ensure indexes exist
CREATE INDEX IF NOT EXISTS "SupportTicketReply_ticketId_idx" ON "SupportTicketReply"("ticketId");
-- Step 6: Ensure foreign key on SupportTicketReply exists
DO $$ BEGIN
ALTER TABLE "SupportTicketReply"
ADD CONSTRAINT "SupportTicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicketReply"
ADD CONSTRAINT "SupportTicketReply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
-- Step 7: Ensure SupportTicket has correct columns for production
-- These columns should already exist from the original migration
-- but we verify they're there
DO $$ BEGIN
ALTER TABLE "SupportTicket"
ADD COLUMN "subject" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket"
ADD COLUMN "message" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket"
ADD COLUMN "createdBy" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket"
ADD COLUMN "assignedTo" TEXT;
EXCEPTION
WHEN duplicate_column THEN null;
END $$;
-- Step 8: Remove columns that were added by the broken migration (if they exist)
-- These columns don't exist in production, only in the broken schema
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "ticketNumber";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "title";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "description";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "category";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "createdById";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "assignedToId";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "resolutionSummary";
EXCEPTION
WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
ALTER TABLE "SupportTicket" DROP COLUMN IF EXISTS "closedAt";
EXCEPTION
WHEN OTHERS THEN null;
END $$;