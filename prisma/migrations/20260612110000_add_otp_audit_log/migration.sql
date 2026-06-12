-- Create OtpAuditLog table
CREATE TABLE IF NOT EXISTS "OtpAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "otp" TEXT,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "channel" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpAuditLog_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "OtpAuditLog_email_idx" ON "OtpAuditLog"("email");
CREATE INDEX IF NOT EXISTS "OtpAuditLog_email_createdAt_idx" ON "OtpAuditLog"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpAuditLog_purpose_idx" ON "OtpAuditLog"("purpose");
CREATE INDEX IF NOT EXISTS "OtpAuditLog_status_idx" ON "OtpAuditLog"("status");

-- Add foreign key
ALTER TABLE "OtpAuditLog" ADD CONSTRAINT "OtpAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
