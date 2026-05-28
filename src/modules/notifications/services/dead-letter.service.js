import prisma from '../../../config/prisma.js';
import notificationService from './notification.service.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS, NOTIFICATION_FAILURE_CATEGORIES, RETRY_ELIGIBILITY } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

class DeadLetterService {
  async moveToDlq(notificationId, reason) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) throw new Error('Notification not found');

    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'DEAD_LETTER' },
    });

    await prisma.notificationRetryLog.create({
      data: {
        tenantId: notification.tenantId,
        notificationId,
        originalChannel: notification.channel,
        retryAttempt: notification.retryCount,
        maxRetries: 5,
        status: 'dead_letter',
        errorMessage: reason,
        movedToDLQAt: new Date(),
        dlqReason: reason,
      },
    });

    await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId,
        eventType: 'DEAD_LETTER',
        errorMessage: reason,
      },
    });

    emitLocalEvent(DOMAIN_EVENTS.NOTIFICATION_DLQ_ENTERED, {
      notificationId,
      reason,
      channel: notification.channel,
      recipient: notification.recipient,
      retryCount: notification.retryCount,
    });

    logger.warn({ notificationId, reason }, '[DLQ] Notification moved to dead letter queue');
    return { success: true };
  }

  async getDlq(tenantId, { page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const where = { tenantId, deliveryStatus: 'DEAD_LETTER' };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          deliveryEvents: {
            where: { eventType: { in: ['FAILED', 'DEAD_LETTER'] } },
            orderBy: { eventTimestamp: 'desc' },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async replayFromDlq(notificationId, tenantId) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, tenantId, deliveryStatus: 'DEAD_LETTER' },
    });
    if (!notification) throw new Error('Dead letter notification not found');

    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'RETRYING' },
    });

    const result = await notificationService.queueNotification({
      tenantId,
      userId: notification.userId,
      patientId: notification.patientId,
      notificationType: notification.notificationType || 'DLQ_REPLAY',
      channel: notification.channel,
      recipient: notification.recipient,
      subject: notification.subject,
      message: notification.message,
      templateName: null,
    });

    logger.info({ notificationId }, '[DLQ] Replayed from dead letter queue');
    return result;
  }

  isRetryEligible(errorMessage) {
    const category = this.categorizeFailure(errorMessage);
    return RETRY_ELIGIBILITY[category] ?? true;
  }

  categorizeFailure(errorMessage) {
    const msg = (errorMessage || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return NOTIFICATION_FAILURE_CATEGORIES.PROVIDER_TIMEOUT;
    if (msg.includes('invalid number') || msg.includes('invalid phone') || msg.includes('invalid recipient')) return NOTIFICATION_FAILURE_CATEGORIES.INVALID_NUMBER;
    if (msg.includes('template') && (msg.includes('reject') || msg.includes('not approved') || msg.includes('policy'))) return NOTIFICATION_FAILURE_CATEGORIES.TEMPLATE_REJECTED;
    if (msg.includes('rate limit') || msg.includes('throttl')) return NOTIFICATION_FAILURE_CATEGORIES.RATE_LIMITED;
    if (msg.includes('provider') && (msg.includes('unavail') || msg.includes('down') || msg.includes('offline'))) return NOTIFICATION_FAILURE_CATEGORIES.PROVIDER_UNAVAILABLE;
    if (msg.includes('delivery') && msg.includes('fail')) return NOTIFICATION_FAILURE_CATEGORIES.DELIVERY_FAILED;
    return NOTIFICATION_FAILURE_CATEGORIES.UNKNOWN;
  }
}

export default new DeadLetterService();
