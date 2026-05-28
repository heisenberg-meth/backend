/**
 * Backend shared constants.
 * Delegates to @viyan/contracts for enum values — do NOT redefine them here.
 */
import {
  SubscriptionStatus,
  Role,
  AuditLogType,
  PurchaseOrderStatus,
  RecallSeverity,
} from '@viyan/contracts';

const SUBSCRIPTION_STATUS = SubscriptionStatus;
const ROLES = Role;
const LOG_TYPES = AuditLogType;

const ORDER_STATUS = {
  DRAFT: PurchaseOrderStatus.DRAFT,
  SENT: PurchaseOrderStatus.SENT,
  RECEIVED: PurchaseOrderStatus.RECEIVED,
  CANCELLED: PurchaseOrderStatus.CANCELLED,
};

const RECALL_SEVERITY = RecallSeverity;

export default {
  SUBSCRIPTION_STATUS,
  ROLES,
  LOG_TYPES,
  ORDER_STATUS,
  RECALL_SEVERITY,
};

export { SUBSCRIPTION_STATUS, ROLES, LOG_TYPES, ORDER_STATUS, RECALL_SEVERITY };