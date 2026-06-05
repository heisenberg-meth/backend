import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

const DELIVERY_STATUS_FLOW = {
  QUEUED: ['SENT', 'FAILED'],
  SENT: ['DELIVERED', 'FAILED'],
  DELIVERED: ['READ'],
  READ: [],
  FAILED: ['QUEUED'],
};

class DeliveryTrackingService {
  async createDelivery(invoiceId, tenantId, channel, recipient, options = {}) {
    const delivery = await prisma.invoiceDeliveryLog.create({
      data: {
        invoiceId,
        tenantId,
        deliveryChannel: channel,
        recipient,
        deliveryStatus: 'QUEUED',
        triggeredBy: options.triggeredBy,
      },
    });

    logger.info(`[Delivery] Created ${channel} delivery ${delivery.id} for invoice ${invoiceId}`);
    return delivery;
  }

  async updateStatus(deliveryLogId, newStatus, options = {}) {
    const current = await prisma.invoiceDeliveryLog.findUnique({
      where: { id: deliveryLogId },
    });

    if (!current) {
      throw new Error(`Delivery log not found: ${deliveryLogId}`);
    }

    const allowed = DELIVERY_STATUS_FLOW[current.deliveryStatus] || [];

    if (!allowed.includes(newStatus)) {
      logger.warn(
        `[Delivery] Invalid status transition: ${current.deliveryStatus} -> ${newStatus}`,
      );
    }

    return prisma.invoiceDeliveryLog.update({
      where: { id: deliveryLogId },
      data: {
        deliveryStatus: newStatus,
        ...(options.failureReason && { failureReason: options.failureReason }),
        ...(options.providerMessageId && { providerMessageId: options.providerMessageId }),
        updatedAt: new Date(),
      },
    });
  }

  async getInvoiceDeliveries(invoiceId) {
    return prisma.invoiceDeliveryLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeliveryTimeline(invoiceId) {
    const logs = await prisma.invoiceDeliveryLog.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
    });

    const timeline = [];

    for (const log of logs) {
      timeline.push({
        id: log.id,
        channel: log.deliveryChannel,
        status: log.deliveryStatus,
        timestamp: log.createdAt,
        recipient: log.recipient,
      });
    }

    return timeline;
  }

  async markAsRead(deliveryLogId) {
    return this.updateStatus(deliveryLogId, 'READ');
  }
}

export default new DeliveryTrackingService();
