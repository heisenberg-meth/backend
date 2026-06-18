import prisma from '../../../config/prisma.js';
import queueService from '../queues/queue.service.js';
import logger from '../../../shared/utils/logger.js';
import templateService from './template.service.js';

class NotificationService {
  async updateStatus(notificationId, status, retryCount = undefined) {
    const data = { deliveryStatus: status };
    if (status === 'SENT' || status === 'DELIVERED') {
      data.sentAt = new Date();
    }
    if (status === 'DELIVERED') {
      data.deliveredAt = new Date();
    }
    if (retryCount !== undefined) {
      data.retryCount = retryCount;
    }
    await prisma.notification.update({ where: { id: notificationId }, data });
  }

  async checkPreferences(userId, channel, notificationType) {
    if (!userId) return true;
    const pref = await prisma.notificationPreference.findFirst({
      where: { userId, channel, notificationType },
    });
    return pref ? pref.enabled : true;
  }

  /**
   * Single entry point for creating + (if needed) dispatching a notification.
   *
   * IN_APP path:  create row with deliveryStatus=DELIVERED, log a DELIVERED
   *               delivery event, return immediately. No BullMQ job.
   * Other channels: create row with deliveryStatus=QUEUED, log a QUEUED
   *               delivery event, enqueue to the channel's BullMQ queue.
   *
   * @param {Object} params
   * @param {string} params.tenantId
   * @param {string} [params.userId]
   * @param {string} [params.patientId]
   * @param {string} params.notificationType  - e.g. 'PAYMENT_SUCCESS', 'Inventory'
   * @param {string} params.channel            - 'IN_APP' | 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH'
   * @param {string} [params.recipient]        - phone/email/deviceToken; REQUIRED for non-IN_APP
   * @param {string} [params.subject]
   * @param {string} [params.message]          - required unless templateName given
   * @param {string} [params.templateName]
   * @param {Object} [params.variables]
   */
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

    const normalisedChannel = channel?.toUpperCase();

    try {
      if (!tenantId) {
        throw new Error('tenantId is required');
      }
      if (!normalisedChannel) {
        throw new Error('channel is required');
      }
      if (normalisedChannel !== 'IN_APP' && !recipient) {
        // This was silently producing notifications with recipient=null for
        // SMS/EMAIL in the old shape — failing loudly here instead, since a
        // queued SMS/Email with no recipient will just fail in the worker
        // anyway, but fail *later* and *less informatively*.
        throw new Error(`recipient is required for channel ${normalisedChannel}`);
      }

      // 1. Check user preferences (opt-out respect)
      if (userId) {
        const isEnabled = await this.checkPreferences(userId, normalisedChannel, notificationType);
        if (!isEnabled) {
          logger.info(
            `[Notification] Skipped ${normalisedChannel} for user ${userId} due to preferences`,
          );
          return { success: false, reason: 'PREFERENCE_DISABLED' };
        }
      }

      // 2. Render template if needed
      let finalMessage = message;
      if (templateName) {
        finalMessage = await templateService.renderTemplate(
          tenantId,
          templateName,
          normalisedChannel,
          variables,
        );
      }

      if (!finalMessage) {
        throw new Error('message is required (or provide templateName + variables)');
      }

      // ── IN_APP fast path: no queue, instantly DELIVERED ──────────────────
      if (normalisedChannel === 'IN_APP') {
        const notification = await prisma.notification.create({
          data: {
            tenantId,
            userId,
            patientId,
            notificationType,
            channel: 'IN_APP',
            recipient: recipient ?? userId ?? null,
            subject,
            message: finalMessage,
            deliveryStatus: 'DELIVERED',
            sentAt: new Date(),
            deliveredAt: new Date(),
            metadata: variables ? { variables } : {},
          },
        });

        await prisma.notificationDeliveryEvent.create({
          data: { notificationId: notification.id, eventType: 'DELIVERED' },
        });

        logger.info({ notificationId: notification.id }, 'IN_APP notification delivered (instant)');
        return { success: true, notificationId: notification.id };
      }

      // ── All other channels: QUEUED → BullMQ ──────────────────────────────
      const notification = await prisma.notification.create({
        data: {
          tenantId,
          userId,
          patientId,
          notificationType,
          channel: normalisedChannel,
          recipient,
          subject,
          message: finalMessage,
          deliveryStatus: 'QUEUED',
          metadata: variables ? { variables } : {},
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: { notificationId: notification.id, eventType: 'QUEUED' },
      });

      await queueService.enqueue(notification.id, normalisedChannel, {
        tenantId,
        recipient,
        subject,
        message: finalMessage,
      });

      logger.info(
        { notificationId: notification.id, channel: normalisedChannel },
        'Notification successfully enqueued',
      );
      return { success: true, notificationId: notification.id };
    } catch (error) {
      // Loud by design — the old silent failure (TypeError swallowed by
      // server.js's try/catch) is exactly what caused this debugging session.
      logger.error({ error: error.message, params }, 'Failed to queue notification');
      return { success: false, reason: 'QUEUE_FAILED', error: error.message };
    }
  }
}

export default new NotificationService();
