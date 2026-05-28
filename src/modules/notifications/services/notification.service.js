import prisma from '../../../config/prisma.js';
import queueService from '../queues/queue.service.js';
import logger from '../../../shared/utils/logger.js';
import templateService from './template.service.js';

class NotificationService {
  async updateStatus(notificationId, status, retryCount = undefined) {
    const data = {
      deliveryStatus: status,
    };
    if (status === 'SENT' || status === 'DELIVERED') {
      data.sentAt = new Date();
    }
    if (retryCount !== undefined) {
      data.retryCount = retryCount;
    }
    await prisma.notification.update({
      where: { id: notificationId },
      data,
    });
  }

  async checkPreferences(userId, channel, notificationType) {
    if (!userId) return true;

    const pref = await prisma.notificationPreference.findFirst({
      where: { userId, channel, notificationType },
    });

    return pref ? pref.enabled : true;
  }

  async queueNotification(params) {
    const {
      tenantId,
      userId,
      patientId,
      notificationType,
      channel,
      recipient,
      subject,
      message,
      templateName,
      variables,
    } = params;

    try {
      // 1. Check Preferences
      if (userId) {
        const isEnabled = await this.checkPreferences(userId, channel, notificationType);
        if (!isEnabled) {
          logger.info(`[Notification] Skipped ${channel} for user ${userId} due to preferences`);
          return { success: false, reason: 'PREFERENCE_DISABLED' };
        }
      }

      // 2. Render Template if needed
      let finalMessage = message;
      if (templateName) {
        finalMessage = await templateService.renderTemplate(tenantId, templateName, channel, variables);
      }

      // 3. Save to DB with initial status QUEUED
      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId,
          patientId,
          notificationType,
          channel: channel.toUpperCase(),
          recipient,
          subject,
          message: finalMessage,
          deliveryStatus: 'QUEUED',
          metadata: variables ? { variables } : {},
        },
      });

      // 4. Record initial delivery event
      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId: notification.id,
          eventType: 'QUEUED',
        },
      });

      // 5. Add to channel-specific BullMQ via queueService
      await queueService.enqueue(notification.id, channel, {
        tenantId,
        recipient,
        subject,
        message: finalMessage,
      });

      logger.info({ notificationId: notification.id, channel }, 'Notification successfully enqueued');
      return { success: true, notificationId: notification.id };
    } catch (error) {
      logger.error({ error, params }, 'Failed to queue notification');
      return { success: false, reason: 'QUEUE_FAILED', error: error.message };
    }
  }
}

export default new NotificationService();
