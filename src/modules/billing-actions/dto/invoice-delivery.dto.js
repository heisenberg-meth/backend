export class PrintJobResponse {
  constructor(printJob) {
    this.printJobId = printJob.id;
    this.status = printJob.printStatus;
    this.printerType = printJob.printerType;
    this.copies = printJob.copies;
    this.createdAt = printJob.createdAt;
  }
}

export class PdfGenerationResponse {
  constructor(result) {
    this.pdfUrl = result.pdfUrl;
    this.expiresAt = result.expiresAt;
    this.deliveryLogId = result.deliveryLogId;
  }
}

export class DeliveryQueuedResponse {
  constructor(deliveryLog, recipient) {
    this.deliveryLogId = deliveryLog.id;
    this.status = deliveryLog.deliveryStatus;
    this.recipient = recipient;
  }
}

export class DeliveryStatusResponse {
  constructor(logs, stats) {
    this.logs = logs;
    this.stats = stats;
  }
}

export class PrintHistoryResponse {
  constructor(printJobs, pagination) {
    this.printJobs = printJobs;
    this.pagination = pagination;
  }
}

export function formatPrintJob(printJob) {
  return {
    id: printJob.id,
    printerType: printJob.printerType,
    copies: printJob.copies,
    status: printJob.printStatus,
    retryCount: printJob.retryCount,
    failureReason: printJob.failureReason,
    createdAt: printJob.createdAt,
    updatedAt: printJob.updatedAt,
  };
}

export function formatDeliveryLog(deliveryLog) {
  return {
    id: deliveryLog.id,
    channel: deliveryLog.deliveryChannel,
    recipient: deliveryLog.recipient,
    status: deliveryLog.deliveryStatus,
    failureReason: deliveryLog.failureReason,
    providerMessageId: deliveryLog.providerMessageId,
    retryCount: deliveryLog.retryCount,
    createdAt: deliveryLog.createdAt,
  };
}
