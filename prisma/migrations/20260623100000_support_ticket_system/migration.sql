-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('INVENTORY', 'BILLING', 'PURCHASE', 'SUPPLIER', 'SALES', 'REPORTS', 'IMPORT', 'ACCOUNT', 'TECHNICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_STAFF', 'RESOLVED', 'CLOSED');

-- AlterTable: Add new columns to SupportTicket
ALTER TABLE "SupportTicket" ADD COLUMN "ticketNumber" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "title" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "description" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "category" "TicketCategory" DEFAULT 'OTHER';
ALTER TABLE "SupportTicket" ADD COLUMN "createdById" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "resolutionSummary" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "closedAt" TIMESTAMP(3);

-- Migrate data: copy subject -> title, message -> description, createdBy -> createdById
UPDATE "SupportTicket" SET "title" = "subject" WHERE "title" IS NULL;
UPDATE "SupportTicket" SET "description" = "message" WHERE "description" IS NULL;
UPDATE "SupportTicket" SET "createdById" = "createdBy" WHERE "createdById" IS NULL;
UPDATE "SupportTicket" SET "assignedToId" = "assignedTo" WHERE "assignedToId" IS NULL;

-- Generate ticket numbers for existing tickets using CTE (window functions not allowed in UPDATE)
WITH ticket_numbers AS (
  SELECT "id",
    'TKT-' || REPLACE(CAST("createdAt" AS TEXT), '-', '') || '-' ||
    LPAD(CAST(ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt") AS TEXT), 4, '0') AS new_number
  FROM "SupportTicket"
  WHERE "ticketNumber" IS NULL
)
UPDATE "SupportTicket" SET "ticketNumber" = tn.new_number
FROM ticket_numbers tn
WHERE "SupportTicket"."id" = tn."id";

-- Make required columns NOT NULL
ALTER TABLE "SupportTicket" ALTER COLUMN "ticketNumber" SET NOT NULL;
ALTER TABLE "SupportTicket" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "SupportTicket" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "SupportTicket" ALTER COLUMN "createdById" SET NOT NULL;

-- Create unique constraint
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");

-- Create indexes
CREATE INDEX "SupportTicket_createdById_idx" ON "SupportTicket"("createdById");
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");
CREATE INDEX "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");

-- Add foreign keys
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old columns
ALTER TABLE "SupportTicket" DROP COLUMN "subject";
ALTER TABLE "SupportTicket" DROP COLUMN "message";
ALTER TABLE "SupportTicket" DROP COLUMN "assignedTo";
ALTER TABLE "SupportTicket" DROP COLUMN "createdBy";

-- Drop old enum columns and rename to new enums
ALTER TABLE "SupportTicket" DROP COLUMN "priority";
ALTER TABLE "SupportTicket" DROP COLUMN "status";
ALTER TABLE "SupportTicket" ADD COLUMN "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "SupportTicket" ADD COLUMN "status" "TicketStatus" NOT NULL DEFAULT 'OPEN';

-- Drop old enums
DROP TYPE "SupportTicketPriority";
DROP TYPE "SupportTicketStatus";

-- Drop old SupportTicketReply table
DROP TABLE "SupportTicketReply";

-- Create SupportMessage table
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportMessage_ticketId_idx" ON "SupportMessage"("ticketId");
CREATE INDEX "SupportMessage_senderId_idx" ON "SupportMessage"("senderId");

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create SupportAttachment table
CREATE TABLE "SupportAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAttachment_ticketId_idx" ON "SupportAttachment"("ticketId");
CREATE INDEX "SupportAttachment_uploadedBy_idx" ON "SupportAttachment"("uploadedBy");

ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAttachment" ADD CONSTRAINT "SupportAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create SupportAuditLog table
CREATE TABLE "SupportAuditLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "performedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportAuditLog_ticketId_idx" ON "SupportAuditLog"("ticketId");
CREATE INDEX "SupportAuditLog_performedBy_idx" ON "SupportAuditLog"("performedBy");

ALTER TABLE "SupportAuditLog" ADD CONSTRAINT "SupportAuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportAuditLog" ADD CONSTRAINT "SupportAuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
