export class GstSummaryResponse {
  constructor(summary) {
    this.taxableAmount = summary.taxableAmount || 0;
    this.cgstTotal = summary.cgstTotal || 0;
    this.sgstTotal = summary.sgstTotal || 0;
    this.igstTotal = summary.igstTotal || 0;
    this.gstCollected = summary.gstCollected || 0;
    this.totalInvoices = summary.totalInvoices || 0;
    this.period = summary.period || null;
    this.generatedAt = summary.generatedAt || new Date().toISOString();
  }
}

export class GstReportResponse {
  constructor(report) {
    this.reportUrl = report.reportUrl;
    this.reportId = report.reportId;
    this.status = report.status;
    this.generatedAt = report.generatedAt;
  }
}

export class HsnSummaryResponse {
  constructor(items) {
    this.items = items;
    this.totalTaxableValue = items.reduce((s, i) => s + Number(i.taxableValue), 0);
    this.totalGst = items.reduce((s, i) => s + Number(i.totalGst), 0);
  }
}

export class GstReconciliationResponse {
  constructor(result) {
    this.totalChecked = result.totalChecked;
    this.mismatchCount = result.mismatchCount;
    this.mismatches = result.mismatches;
    this.totalOutputGst = result.totalOutputGst;
    this.totalInputGst = result.totalInputGst;
    this.netGstLiability = result.netGstLiability;
  }
}

export function formatGstSummary(summary) {
  return {
    id: summary.id,
    reportMonth: summary.reportMonth,
    totalSalesGst: summary.totalSalesGst,
    totalPurchaseGst: summary.totalPurchaseGst,
    outputTax: summary.outputTax,
    inputTaxCredit: summary.inputTaxCredit,
    netGstPayable: summary.netGstPayable,
    generatedAt: summary.generatedAt,
  };
}

export function formatGstAuditLog(log) {
  return {
    id: log.id,
    invoiceId: log.invoiceId,
    invoiceNumber: log.invoice?.invoiceNumber,
    action: log.action,
    taxBefore: log.taxBefore,
    taxAfter: log.taxAfter,
    difference: (Number(log.taxAfter) - Number(log.taxBefore)).toFixed(2),
    performedBy: log.user?.fullName || log.modifiedBy,
    createdAt: log.createdAt,
  };
}
