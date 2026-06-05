import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export function emitRefundCreated(returnId, returnNumber, invoiceId, totalRefundAmount) {
  emitLocalEvent(EVENTS.RETURN_CREATED, {
    returnId,
    returnNumber,
    invoiceId,
    totalRefundAmount,
    timestamp: new Date().toISOString(),
  });
}

export function emitRefundCompleted(returnId, returnNumber, invoiceId, totalRefundAmount) {
  emitLocalEvent(EVENTS.REFUND_COMPLETED, {
    returnId,
    returnNumber,
    invoiceId,
    totalRefundAmount,
    timestamp: new Date().toISOString(),
  });
}

export function emitRefundApproved(returnId, approvedBy) {
  emitLocalEvent(EVENTS.RETURN_APPROVED, {
    returnId,
    approvedBy,
    timestamp: new Date().toISOString(),
  });
}

export function emitRefundRejected(returnId, rejectedBy, reason) {
  emitLocalEvent(EVENTS.RETURN_REJECTED, {
    returnId,
    rejectedBy,
    reason,
    timestamp: new Date().toISOString(),
  });
}

export function emitGstAdjusted(returnId, invoiceId, gstAdjustment) {
  emitLocalEvent(EVENTS.GST_ADJUSTED, {
    returnId,
    invoiceId,
    gstAdjustment,
    timestamp: new Date().toISOString(),
  });
}
