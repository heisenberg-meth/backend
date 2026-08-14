/**
 * @module @viyan/contracts/enums
 * Single source of truth for all shared enums.
 * These MUST match the Prisma schema enums exactly.
 * Frontend and backend import from here — never define string literals inline.
 */

// ── Subscription ────────────────────────────────────────────────────────
export const SubscriptionStatus = Object.freeze({
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  GRACE_PERIOD: 'GRACE_PERIOD',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
});
