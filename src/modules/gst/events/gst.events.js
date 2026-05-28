import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export function emitGstReportGenerated(tenantId, reportId, period) {
  emitLocalEvent(EVENTS.GST_REPORT_GENERATED, {
    tenantId,
    reportId,
    period,
    timestamp: new Date().toISOString(),
  });
}

export function emitGstMismatchDetected(tenantId, mismatchCount, period) {
  emitLocalEvent(EVENTS.GST_MISMATCH_DETECTED, {
    tenantId,
    mismatchCount,
    period,
    timestamp: new Date().toISOString(),
  });
}

export function emitGstReconciliationCompleted(tenantId, totalChecked, mismatchCount) {
  emitLocalEvent(EVENTS.GST_RECONCILIATION_COMPLETED, {
    tenantId,
    totalChecked,
    mismatchCount,
    timestamp: new Date().toISOString(),
  });
}

export function emitGstExportGenerated(tenantId, filename, invoiceCount) {
  emitLocalEvent(EVENTS.GST_EXPORT_GENERATED, {
    tenantId,
    filename,
    invoiceCount,
    timestamp: new Date().toISOString(),
  });
}
