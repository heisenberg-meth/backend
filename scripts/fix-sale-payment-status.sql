-- ============================================================
-- One-time fix: Correct paymentStatus for CASH/UPI/CARD sales
-- that were incorrectly saved as 'PENDING'.
--
-- Run this against your PostgreSQL database:
--   psql $DATABASE_URL -f fix-sale-payment-status.sql
-- ============================================================
BEGIN;
-- 1. Fix Sale records
UPDATE "Sale"
SET "paymentStatus" = 'PAID'
WHERE "paymentStatus" = 'PENDING'
  AND "paymentMethod" IN ('CASH', 'UPI', 'CARD')
  AND "status" = 'COMPLETED';
-- 2. Fix Invoice records linked to those Sales
UPDATE "Invoice" i
SET "paymentStatus" = 'PAID'
FROM "Sale" s
WHERE i."id" = s."invoiceId"
  AND s."paymentMethod" IN ('CASH', 'UPI', 'CARD')
  AND s."status" = 'COMPLETED'
  AND i."paymentStatus" IN ('UNPAID', 'PARTIAL');
COMMIT;
-- Verify
SELECT 'Sale' AS model,
  COUNT(*) AS fixed_count
FROM "Sale"
WHERE "paymentStatus" = 'PAID'
  AND "paymentMethod" IN ('CASH', 'UPI', 'CARD')
  AND "status" = 'COMPLETED'
UNION ALL
SELECT 'Invoice' AS model,
  COUNT(*) AS fixed_count
FROM "Invoice"
WHERE "paymentStatus" = 'PAID';