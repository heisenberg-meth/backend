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

// ── Payment ─────────────────────────────────────────────────────────────
export const PaymentStatus = Object.freeze({
  CREATED: 'CREATED',
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  RECONCILING: 'RECONCILING',
  RECOVERY_PENDING: 'RECOVERY_PENDING',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  REVERSED: 'REVERSED',
});

// ── Roles ───────────────────────────────────────────────────────────────
export const Role = Object.freeze({
  OWNER: 'OWNER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
  PHARMACIST: 'PHARMACIST',
  CASHIER: 'CASHIER',
});

// ── Purchase Orders ─────────────────────────────────────────────────────
export const PurchaseOrderStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  RECONCILED: 'RECONCILED',
  CANCELLED: 'CANCELLED',
});

// ── Medicine ────────────────────────────────────────────────────────────
export const MedicineStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  DISCONTINUED: 'DISCONTINUED',
  BLOCKED: 'BLOCKED',
  RESTRICTED: 'RESTRICTED',
  RECALLED: 'RECALLED',
});

// ── Supplier ────────────────────────────────────────────────────────────
export const SupplierStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
  BLOCKED: 'BLOCKED',
  BLACKLISTED: 'BLACKLISTED',
  ARCHIVED: 'ARCHIVED',
});

export const SupplierType = Object.freeze({
  WHOLESALER: 'WHOLESALER',
  MANUFACTURER: 'MANUFACTURER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  LOCAL_VENDOR: 'LOCAL_VENDOR',
});

// ── Stock ───────────────────────────────────────────────────────────────
export const StockAlertType = Object.freeze({
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  EXPIRING: 'EXPIRING',
  EXPIRED: 'EXPIRED',
  RECALLED: 'RECALLED',
  OVERSTOCK: 'OVERSTOCK',
  PROCUREMENT_DELAY: 'PROCUREMENT_DELAY',
});

export const AlertStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  SNOOZED: 'SNOOZED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
  ON_ORDER: 'ON_ORDER',
});

// ── Audit ───────────────────────────────────────────────────────────────
export const AuditLogType = Object.freeze({
  SECURITY: 'SECURITY',
  INVENTORY: 'INVENTORY',
  FINANCIAL: 'FINANCIAL',
  SYSTEM: 'SYSTEM',
  ACCESS: 'ACCESS',
});

// ── Recall Severity ─────────────────────────────────────────────────────
export const RecallSeverity = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});
