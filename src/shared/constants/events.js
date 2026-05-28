/**
 * Domain event constants for the ERP event bus.
 * These events are emitted by modules and consumed by listeners/workers.
 *
 * Usage:
 *   import { DOMAIN_EVENTS } from '../constants/events.js';
 *   import { emitLocalEvent, emitEvent } from '../shared/events/local-event-bus.js';
 *
 *   emitLocalEvent(DOMAIN_EVENTS.SALE_COMPLETED, { saleId, total, items });
 *   await emitEvent(DOMAIN_EVENTS.INVOICE_GENERATED, { invoiceId, patientId });
 */
export const DOMAIN_EVENTS = {
  // ── Sales & Billing ──────────────────────────────────────────
  SALE_COMPLETED: 'sale.completed',
  SALE_CANCELLED: 'sale.cancelled',
  SALE_RETURNED: 'sale.returned',
  INVOICE_GENERATED: 'invoice.generated',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_CANCELLED: 'invoice.cancelled',
  INVOICE_PDF_READY: 'invoice.pdf_ready',
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',
  CREDIT_NOTE_ISSUED: 'credit_note.issued',
  REFUND_PROCESSED: 'refund.processed',

  // ── Inventory ────────────────────────────────────────────────
  STOCK_LOW: 'stock.low',
  STOCK_OUT: 'stock.out',
  STOCK_REPLENISHED: 'stock.replenished',
  STOCK_ADJUSTED: 'stock.adjusted',
  STOCK_TRANSFERRED: 'stock.transferred',
  BATCH_EXPIRING: 'batch.expiring',
  BATCH_EXPIRED: 'batch.expired',
  BATCH_RECALLED: 'batch.recalled',
  MEDICINE_CREATED: 'medicine.created',
  MEDICINE_UPDATED: 'medicine.updated',
  MEDICINE_ARCHIVED: 'medicine.archived',

  // ── Procurement & Suppliers ─────────────────────────────────
  PURCHASE_ORDER_CREATED: 'purchase_order.created',
  PURCHASE_ORDER_APPROVED: 'purchase_order.approved',
  PURCHASE_ORDER_RECEIVED: 'purchase_order.received',
  PURCHASE_ORDER_CANCELLED: 'purchase_order.cancelled',
  SUPPLIER_INVOICE_RECEIVED: 'supplier_invoice.received',
  GOODS_RECEIVED: 'goods.received',
  SUPPLIER_CREATED: 'supplier.created',
  SUPPLIER_UPDATED: 'supplier.updated',
  SUPPLIER_ARCHIVED: 'supplier.archived',
  SUPPLIER_STATUS_CHANGED: 'supplier.status_changed',
  SUPPLIER_SCORE_UPDATED: 'supplier.score_updated',

  // ── Patients & CRM ───────────────────────────────────────────
  PATIENT_CREATED: 'patient.created',
  PATIENT_UPDATED: 'patient.updated',
  PATIENT_ARCHIVED: 'patient.archived',
  PRESCRIPTION_CREATED: 'prescription.created',
  PRESCRIPTION_VERIFIED: 'prescription.verified',
  PRESCRIPTION_FULFILLED: 'prescription.fulfilled',
  PRESCRIPTION_EXPIRING: 'prescription.expiring',
  REFILL_DUE: 'refill.due',
  REFILL_MISSED: 'refill.missed',
  REMINDER_SENT: 'reminder.sent',
  INSURANCE_UPDATED: 'patient.insurance.updated',
  ADHERENCE_ALERT: 'patient.adherence.alert',
  CHRONIC_PATTERN_DETECTED: 'patient.chronic.detected',

  // ── Notifications ────────────────────────────────────────────
  NOTIFICATION_QUEUED: 'notification.queued',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_DELIVERED: 'notification.delivered',
  NOTIFICATION_FAILED: 'notification.failed',
  NOTIFICATION_RETRYING: 'notification.retrying',
  NOTIFICATION_RETRIED: 'notification.retried',
  NOTIFICATION_BOUNCED: 'notification.bounced',
  NOTIFICATION_OPENED: 'notification.opened',
  NOTIFICATION_DLQ_ENTERED: 'notification.dlq.entered',
  CHANNEL_FALLBACK: 'notification.channel.fallback',
  PROVIDER_FAILOVER_TRIGGERED: 'notification.provider.failover',
  OTP_SENT: 'notification.otp.sent',
  OTP_VERIFIED: 'notification.otp.verified',
  TEMPLATE_RENDERED: 'notification.template.rendered',
  EMAIL_SENT: 'email.sent',
  SMS_SENT: 'sms.sent',
  WHATSAPP_SENT: 'whatsapp.sent',

  // ── Settings & Governance ────────────────────────────────────
  SETTINGS_UPDATED: 'settings.updated',
  GST_SETTINGS_UPDATED: 'settings.gst.updated',
  TAX_POLICY_CHANGED: 'tax.policy_changed',
  SETTINGS_AUDIT_LOGGED: 'settings.audit_logged',

  // ── Security & Access ────────────────────────────────────────
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_CREATED: 'user.created',
  USER_ARCHIVED: 'user.archived',
  PERMISSION_CHANGED: 'permission.changed',
  SESSION_EXPIRED: 'session.expired',
  BRUTE_FORCE_DETECTED: 'brute_force.detected',

  // ── Analytics & Reporting ────────────────────────────────────
  REPORT_GENERATED: 'report.generated',
  DAILY_SUMMARY_READY: 'daily_summary.ready',
  GST_FILING_READY: 'gst_filing.ready',
  ANALYTICS_SNAPSHOT: 'analytics.snapshot',

  // ── System ───────────────────────────────────────────────────
  CACHE_INVALIDATED: 'cache.invalidated',
  WEBHOOK_RECEIVED: 'webhook.received',
  IMPORT_COMPLETED: 'import.completed',
  IMPORT_FAILED: 'import.failed',
  OCR_PROCESSING_COMPLETE: 'ocr.processing_complete',
};

/**
 * Event priority levels for the distributed event bus.
 */
export const EVENT_PRIORITY = {
  CRITICAL: 0, // Security alerts, payment failures
  HIGH: 1, // Stock alerts, prescription events
  NORMAL: 2, // Standard business events
  LOW: 3, // Analytics, reporting, logging
};

/**
 * Event retention periods (in seconds) for the distributed event bus.
 */
export const EVENT_RETENTION = {
  CRITICAL: 7 * 24 * 60 * 60, // 7 days
  HIGH: 3 * 24 * 60 * 60, // 3 days
  NORMAL: 24 * 60 * 60, // 1 day
  LOW: 60 * 60, // 1 hour
};

export const PROCUREMENT_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  ORDERED: 'ORDERED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
  RECONCILED: 'RECONCILED',
};

export const BILLING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
};

export const PRESCRIPTION_STATUS = {
  UPLOADED: 'UPLOADED',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  FULFILLED: 'FULFILLED',
  CANCELLED: 'CANCELLED',
};

export const PRESCRIPTION_EVENTS = {
  PRESCRIPTION_CREATED: 'prescription.created',
  PRESCRIPTION_VERIFIED: 'prescription.verified',
  PRESCRIPTION_REJECTED: 'prescription.rejected',
  PRESCRIPTION_DISPENSED: 'prescription.dispensed',
  PRESCRIPTION_PARTIALLY_DISPENSED: 'prescription.partially_dispensed',
  PRESCRIPTION_EXPIRED: 'prescription.expired',
  PRESCRIPTION_ARCHIVED: 'prescription.archived',
  OCR_COMPLETED: 'prescription.ocr_completed',
  OCR_FAILED: 'prescription.ocr_failed',
  REFILL_DUE: 'prescription.refill_due',
  REFILL_PROCESSED: 'prescription.refill_processed',
};

export const EVENTS = {
  ...DOMAIN_EVENTS,
  ...PRESCRIPTION_EVENTS,
  INVOICE_PRINTED: 'billing.invoice.printed',
  INVOICE_PDF_GENERATED: 'billing.invoice.pdf_generated',
  INVOICE_PDF_REGENERATED: 'billing.invoice.pdf_regenerated',
  INVOICE_WHATSAPP_SENT: 'billing.invoice.whatsapp_sent',
  INVOICE_EMAIL_SENT: 'billing.invoice.email_sent',
  INVOICE_DELIVERY_FAILED: 'billing.invoice.delivery_failed',
  INVOICE_DOWNLOADED: 'billing.invoice.downloaded',
  GST_REPORT_GENERATED: 'gst.report.generated',
  GST_MISMATCH_DETECTED: 'gst.mismatch.detected',
  GST_RECONCILIATION_COMPLETED: 'gst.reconciliation.completed',
  GST_EXPORT_GENERATED: 'gst.export.generated',
  RETURN_CREATED: 'billing.return.created',
  RETURN_APPROVED: 'billing.return.approved',
  RETURN_REJECTED: 'billing.return.rejected',
  CREDIT_NOTE_GENERATED: 'billing.credit_note.generated',
  REFUND_COMPLETED: 'billing.refund.completed',
  INVENTORY_REVERSED: 'billing.return.inventory_reversed',
  GST_ADJUSTED: 'billing.return.gst_adjusted',
  LOW_STOCK_DETECTED: 'inventory.alert.low_stock',
  OUT_OF_STOCK_DETECTED: 'inventory.alert.out_of_stock',
  EXPIRY_WARNING: 'inventory.alert.expiry_warning',
  FEFO_VIOLATION_DETECTED: 'inventory.alert.fefo_violation',
  ALERT_RESOLVED: 'inventory.alert.resolved',
  ALERT_SCAN_COMPLETED: 'inventory.alert.scan_completed',
  REORDER_RECOMMENDED: 'inventory.alert.reorder_recommended',
  STOCK_TRANSFER_RECOMMENDED: 'inventory.alert.transfer_recommended',
  STOCK_ALERT_CREATED: 'inventory.alert.created',
  ALERT_CREATED: 'alert.lifecycle.created',
  ALERT_ESCALATED: 'alert.lifecycle.escalated',
  ALERT_SNOOZED: 'alert.lifecycle.snoozed',
  PURCHASE_ORDER_RAISED: 'alert.procurement.raised',
};

export const NOTIFICATION_FAILURE_CATEGORIES = {
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  INVALID_NUMBER: 'INVALID_NUMBER',
  TEMPLATE_REJECTED: 'TEMPLATE_REJECTED',
  RATE_LIMITED: 'RATE_LIMITED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  UNKNOWN: 'UNKNOWN',
};

export const RETRY_ELIGIBILITY = {
  [NOTIFICATION_FAILURE_CATEGORIES.PROVIDER_TIMEOUT]: true,
  [NOTIFICATION_FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE]: true,
  [NOTIFICATION_FAILURE_CATEGORIES.DELIVERY_FAILED]: true,
  [NOTIFICATION_FAILURE_CATEGORIES.RATE_LIMITED]: true,
  [NOTIFICATION_FAILURE_CATEGORIES.INVALID_NUMBER]: false,
  [NOTIFICATION_FAILURE_CATEGORIES.TEMPLATE_REJECTED]: false,
  [NOTIFICATION_FAILURE_CATEGORIES.UNKNOWN]: true,
};
