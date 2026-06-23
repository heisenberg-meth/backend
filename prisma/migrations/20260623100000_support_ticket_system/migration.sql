-- This migration was originally a schema duplication that introduced
-- SupportMessage, SupportAttachment, SupportAuditLog, TicketStatus, TicketPriority, TicketCategory
-- which conflicted with the existing production tables.
-- It has been replaced with a no-op to prevent re-application.
-- See migration 20260624_support_schema_reconciliation for the fix.
SELECT 1;