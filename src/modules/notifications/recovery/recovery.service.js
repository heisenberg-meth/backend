import prisma from '../../../config/prisma.js';
import queueService from '../queues/queue.service.js';
import logger from '../../../shared/utils/logger.js';

class NotificationRecoveryService {
  /**
   * Get failed notifications that are retry candidates
   */
  async getFailed(tenantId, filters = {}) {
    const { page = 1, limit = 20 } = filters;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      tenantId,
      deliveryStatus: 'FAILED',
      retryCount: { lt: prisma.notification.fields.maxRetries },
    };

    const [failedNotifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      failedNotifications,
      pagination: {
        page: parseInt(page),
        total,
      },
    };
  }

  /**
   * Manually retry a specific notification
   */
  async retry(id, tenantId, userId) {
    const notification = await prisma.notification.findFirst({
      where: { id, tenantId },
    });

    if (!notification) throw new Error('Notification not found');
    if (notification.deliveryStatus === 'DELIVERED')
      throw new Error('Notification already delivered');

    // Reset status to RETRYING and increment count
    const updated = await prisma.notification.update({
      where: { id },
      data: {
        deliveryStatus: 'RETRYING',
        lastRetryAt: new Date(),
        retryCount: { increment: 1 },
      },
    });

    // Record the event
    await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId: id,
        eventType: 'RETRYING',
        notes: `Manual retry initiated by user ${userId}`,
      },
    });

    // Re-enqueue
    await queueService.enqueue(id, notification.channel);

    logger.info({ notificationId: id, tenantId, userId }, 'Notification manually retried');
    return updated;
  }

  /**
   * Move notification to Dead Letter Queue (DLQ)
   */
  async moveToDLQ(id, reason, payload) {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.notification.update({
        where: { id },
        data: { deliveryStatus: 'DEAD_LETTER', failureReason: reason },
      });

      await tx.notificationDeadLetter.upsert({
        where: { notificationId: id },
        update: {
          failureReason: reason,
          retryCount: updated.retryCount,
          movedAt: new Date(),
        },
        create: {
          notificationId: id,
          tenantId: updated.tenantId,
          failureReason: reason,
          payload: payload || {},
          retryCount: updated.retryCount,
        },
      });

      await tx.notificationDeliveryEvent.create({
        data: {
          notificationId: id,
          eventType: 'DEAD_LETTER',
          errorMessage: reason,
        },
      });

      return updated;
    });
  }

  /**
   * Get DLQ entries for admin review
   */
  async getDLQ(tenantId = {}) {
    return await prisma.notificationDeadLetter.findMany({
      where: { tenantId, resolution: null },
      include: { notification: true },
      orderBy: { movedAt: 'desc' },
    });
  }
}

export default new NotificationRecoveryService();
