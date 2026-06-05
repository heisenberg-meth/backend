import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class InvoiceAuditService {
  async logInvoiceAction(invoiceId, tenantId, action, data = {}) {
    const { performedBy, notes } = data;

    const log = await prisma.invoiceAuditLog.create({
      data: {
        invoiceId,
        action,
        performedBy: performedBy || 'system',
        notes: notes || '',
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: performedBy,
        action: `INVOICE_${action}`,
        target: invoiceId,
        type: 'FINANCIAL',
      },
    });

    logger.info(`[InvoiceAudit] ${action} for invoice ${invoiceId}`);
    return log;
  }

  async logDeliveryFailure(invoiceId, tenantId, channel, recipient, error, metadata = {}) {
    const failureLog = await prisma.invoiceDeliveryLog.create({
      data: {
        invoiceId,
        tenantId,
        deliveryChannel: channel,
        recipient,
        deliveryStatus: 'FAILED',
        failureReason: error.message || String(error),
        triggeredBy: metadata.triggeredBy,
      },
    });

    emitLocalEvent(EVENTS.INVOICE_DELIVERY_FAILED, {
      invoiceId,
      tenantId,
      channel,
      recipient,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    return failureLog;
  }

  async getFailedDeliveries(tenantId, options = {}) {
    const { limit = 50, channel } = options;
    const where = { tenantId, deliveryStatus: 'FAILED' };
    if (channel) where.deliveryChannel = channel;

    return prisma.invoiceDeliveryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
          },
        },
      },
    });
  }

  async getDeliveryAnalytics(invoiceId) {
    const logs = await prisma.invoiceDeliveryLog.findMany({
      where: { invoiceId },
      select: {
        deliveryChannel: true,
        deliveryStatus: true,
        createdAt: true,
        recipient: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const analytics = {
      totalAttempts: logs.length,
      byChannel: {},
      byStatus: {},
      timeline: [],
      recipients: {},
    };

    for (const log of logs) {
      analytics.byChannel[log.deliveryChannel] =
        (analytics.byChannel[log.deliveryChannel] || 0) + 1;
      analytics.byStatus[log.deliveryStatus] = (analytics.byStatus[log.deliveryStatus] || 0) + 1;
      analytics.timeline.push({
        channel: log.deliveryChannel,
        status: log.deliveryStatus,
        timestamp: log.createdAt,
      });
      if (!analytics.recipients[log.deliveryChannel]) {
        analytics.recipients[log.deliveryChannel] = new Set();
      }
      analytics.recipients[log.deliveryChannel].add(log.recipient);
    }

    for (const channel of Object.keys(analytics.recipients)) {
      analytics.recipients[channel] = Array.from(analytics.recipients[channel]);
    }

    return analytics;
  }

  async getInvoiceAuditTrail(invoiceId) {
    const [auditLogs, deliveryLogs, printJobs] = await Promise.all([
      prisma.invoiceAuditLog.findMany({
        where: { invoiceId },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoiceDeliveryLog.findMany({
        where: { invoiceId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoicePrintJob.findMany({
        where: { invoiceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      auditLogs,
      deliveryLogs,
      printJobs,
    };
  }
}

export default new InvoiceAuditService();
