export class RefundResponse {
  constructor(refund) {
    this.id = refund.id;
    this.returnNumber = refund.returnNumber;
    this.invoiceId = refund.invoiceId;
    this.invoiceNumber = refund.invoice?.invoiceNumber;
    this.patientId = refund.patientId;
    this.patientName = refund.patient?.fullName;
    this.returnReason = refund.returnReason;
    this.status = refund.status;
    this.totalReturnAmount = Number(refund.totalReturnAmount);
    this.totalGstAdjustment = Number(refund.totalGstAdjustment);
    this.refundMethod = refund.refundMethod;
    this.refundStatus = refund.refundStatus;
    this.approvalRequired = refund.approvalRequired;
    this.approvedBy = refund.approvedBy;
    this.fraudScore = refund.fraudScore;
    this.fraudFlags = refund.fraudFlags;
    this.items = (refund.items || []).map(RefundItemResponse);
    this.payments = (refund.refundPayments || []).map(RefundPaymentResponse);
    this.createdAt = refund.createdAt;
    this.updatedAt = refund.updatedAt;
  }
}

export function RefundItemResponse(item) {
  return {
    id: item.id,
    invoiceItemId: item.invoiceItemId,
    medicineId: item.medicineId,
    medicineName: item.medicine?.name,
    batchId: item.batchId,
    batchNumber: item.batch?.batchNumber,
    returnedQuantity: item.returnedQuantity,
    originalQuantity: item.originalQuantity,
    unitPrice: item.unitPrice,
    gstPercentage: item.gstPercentage,
    returnAmount: item.returnAmount,
    gstAdjustment: item.gstAdjustment,
    disposition: item.disposition,
  };
}

export function RefundPaymentResponse(payment) {
  return {
    id: payment.id,
    paymentMode: payment.paymentMode,
    amount: Number(payment.amount),
    transactionReference: payment.transactionReference,
    refundStatus: payment.refundStatus,
    createdAt: payment.createdAt,
  };
}

export class RefundSummaryResponse {
  constructor(refund) {
    this.id = refund.id;
    this.returnNumber = refund.returnNumber;
    this.invoiceNumber = refund.invoice?.invoiceNumber;
    this.patientName = refund.patient?.fullName;
    this.totalReturnAmount = Number(refund.totalReturnAmount);
    this.status = refund.status;
    this.refundStatus = refund.refundStatus;
    this.returnReason = refund.returnReason;
    this.fraudScore = refund.fraudScore;
    this.createdAt = refund.createdAt;
  }
}

export class RefundAnalyticsResponse {
  constructor(data) {
    this.totalRefunds = data.totalRefunds;
    this.totalRefundAmount = data.totalRefundAmount;
    this.pendingApprovals = data.pendingApprovals;
    this.refundRate = data.refundRate;
    this.topReasons = data.topReasons;
    this.monthlyTrend = data.monthlyTrend;
  }
}
