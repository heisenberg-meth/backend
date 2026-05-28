import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class DeliveryAuditService {
  async logDelivery(data) {
    const {
      invoiceId,
      tenantId,
      deliveryChannel,
      recipient,
      deliveryStatus = 'QUEUED',
      failureReason,
      providerMessageId,
      triggeredBy,
      pdfUrl,
      expiresAt,
    } = data;

    return prisma.invoiceDeliveryLog.create({
      data: {
        invoiceId,
        tenantId,
        deliveryChannel,
        recipient,
        deliveryStatus,
        failureReason,
        providerMessageId,
        triggeredBy,
        pdfUrl,
        expiresAt,
      },
    });
  }

  async updateDeliveryStatus(logId, status, options = {}) {
    const { failureReason, providerMessageId, retryCount } = options;

    return prisma.invoiceDeliveryLog.update({
      where: { id: logId },
      data: {
        deliveryStatus: status,
        ...(failureReason && { failureReason }),
        ...(providerMessageId && { providerMessageId }),
        ...(retryCount !== undefined && { retryCount }),
        updatedAt: new Date(),
      },
    });
  }

  async getDeliveryStatus(invoiceId) {
    return prisma.invoiceDeliveryLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeliveryStats(invoiceId) {
    const logs = await prisma.invoiceDeliveryLog.findMany({
      where: { invoiceId },
      select: {
        deliveryChannel: true,
        deliveryStatus: true,
        createdAt: true,
      },
    });

    const stats = {
      total: logs.length,
      byChannel: {},
      byStatus: {},
      lastDelivery: null,
    };

    logs.forEach((log) => {
      stats.byChannel[log.deliveryChannel] = (stats.byChannel[log.deliveryChannel] || 0) + 1;
      stats.byStatus[log.deliveryStatus] = (stats.byStatus[log.deliveryStatus] || 0) + 1;
    });

    if (logs.length > 0) {
      stats.lastDelivery = logs[0];
    }

    return stats;
  }

  async getFailedDeliveries(tenantId, limit = 50) {
    return prisma.invoiceDeliveryLog.findMany({
      where: {
        tenantId,
        deliveryStatus: 'FAILED',
      },
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

  async getExpiredUrls() {
    return prisma.invoiceDeliveryLog.findMany({
      where: {
        pdfUrl: { not: null },
        expiresAt: { lt: new Date() },
        deliveryChannel: 'PDF',
      },
    });
  }

  async invalidateExpiredUrls() {
    const expired = await this.getExpiredUrls();

    if (expired.length > 0) {
      await prisma.invoiceDeliveryLog.updateMany({
        where: {
          id: { in: expired.map((log) => log.id) },
        },
        data: {
          pdfUrl: null,
          updatedAt: new Date(),
        },
      });

      logger.info(`[Audit] Invalidated ${expired.length} expired PDF URLs`);
    }

    return expired.length;
  }
}

export default new DeliveryAuditService();
