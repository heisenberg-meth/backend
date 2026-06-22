# PaymentSession Migration Guide

## Overview
This migration adds the `PaymentSession` table and updates the `AuditLogType` enum to support secure subscription checkout flow.

## Changes
1. **New Table**: `PaymentSession` - Tracks checkout sessions with state parameter validation
2. **New Enum**: `PaymentSessionStatus` - 9 states for checkout flow
3. **Updated Enum**: `AuditLogType` - Added `PAYMENT` and `SUBSCRIPTION` values

## Pre-Migration Checklist
- [ ] Backup database
- [ ] Verify no active migrations in progress
- [ ] Check disk space for indexes
- [ ] Schedule maintenance window (recommended)

## Migration Commands

### Option 1: Using Prisma (Recommended)
```bash
cd backend
npx prisma migrate deploy
```

### Option 2: Manual SQL Execution
```bash
# Connect to database
psql -h <host> -U <user> -d <database>

# Run migration
\i prisma/migrations/20260622000000_add_payment_session/migration.sql
```

## Post-Migration Verification
```sql
-- Verify table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'PaymentSession';

-- Verify enum values
SELECT enum_range(NULL::"PaymentSessionStatus");

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'PaymentSession';
```

## Rollback Plan
If issues occur, run:
```sql
DROP TABLE IF EXISTS "PaymentSession";
DROP TYPE IF EXISTS "PaymentSessionStatus";
```

Note: Removing enum values requires creating a new enum type and migrating data.

## Impact
- **Reads**: Minimal impact (new table only)
- **Writes**: New checkout flow adds ~2 writes per session
- **Storage**: ~1KB per payment session record
- **Indexes**: 7 indexes added for query performance

## Dependencies
- Requires existing `Tenant`, `User`, `SubscriptionPlan`, `Subscription` tables
- Requires `AuditLogType` enum to exist

## Testing
After migration, verify:
1. Checkout session creation works
2. Payment status polling works
3. Webhook processing updates sessions
4. Expired sessions are cleaned up hourly
