-- BACKFILL: Create default branches for tenants that have users with NULL branchId
-- Run this against your database AFTER deploying the code changes.

-- Step 1: Create a default "Main Branch" for every tenant that has users but no branches
INSERT INTO "Branch" (id, name, code, "tenantId", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'Main Branch',
  'BR-' || UPPER(LEFT(gen_random_uuid()::text, 8)),
  t.id,
  'ACTIVE',
  NOW(),
  NOW()
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "Branch" b WHERE b."tenantId" = t.id
)
AND EXISTS (
  SELECT 1 FROM "User" u WHERE u."tenantId" = t.id
);

-- Step 2: Assign all orphaned users (branchId IS NULL) to their tenant's default branch
UPDATE "User" u
SET "branchId" = (
  SELECT b.id FROM "Branch" b
  WHERE b."tenantId" = u."tenantId"
  ORDER BY b."createdAt" ASC
  LIMIT 1
)
WHERE u."branchId" IS NULL;

-- Step 3: Verify the fix
SELECT
  u.id AS "userId",
  u.email,
  u."tenantId",
  u."branchId",
  CASE WHEN u."branchId" IS NULL THEN 'BROKEN' ELSE 'FIXED' END AS status
FROM "User" u;
