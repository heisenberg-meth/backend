import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export function emitInvoicePdfGenerated(invoiceId, tenantId, pdfUrl, deliveryLogId) {
  emitLocalEvent(EVENTS.INVOICE_PDF_GENERATED, {
    invoiceId,
    tenantId,
    pdfUrl,
    deliveryLogId,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoicePdfRegenerated(invoiceId, tenantId, pdfUrl, deliveryLogId, reason) {
  emitLocalEvent(EVENTS.INVOICE_PDF_REGENERATED, {
    invoiceId,
    tenantId,
    pdfUrl,
    deliveryLogId,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoicePrinted(invoiceId, printJobId, printerType, tenantId) {
  emitLocalEvent(EVENTS.INVOICE_PRINTED, {
    invoiceId,
    printJobId,
    printerType,
    tenantId,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoiceWhatsappSent(invoiceId, tenantId, recipient, messageId) {
  emitLocalEvent(EVENTS.INVOICE_WHATSAPP_SENT, {
    invoiceId,
    tenantId,
    recipient,
    messageId,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoiceEmailSent(invoiceId, tenantId, recipient, messageId) {
  emitLocalEvent(EVENTS.INVOICE_EMAIL_SENT, {
    invoiceId,
    tenantId,
    recipient,
    messageId,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoiceDeliveryFailed(invoiceId, tenantId, channel, recipient, error) {
  emitLocalEvent(EVENTS.INVOICE_DELIVERY_FAILED, {
    invoiceId,
    tenantId,
    channel,
    recipient,
    error,
    timestamp: new Date().toISOString(),
  });
}

export function emitInvoiceDownloaded(invoiceId, tenantId, userId) {
  emitLocalEvent(EVENTS.INVOICE_DOWNLOADED, {
    invoiceId,
    tenantId,
    userId,
    timestamp: new Date().toISOString(),
  });
}
