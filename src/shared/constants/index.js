import {
  SubscriptionStatus,
  Role,
  AuditLogType,
  PurchaseOrderStatus,
  RecallSeverity,
} from '../../packages/enums.js';

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