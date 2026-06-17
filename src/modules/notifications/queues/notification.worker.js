import { Worker } from 'bullmq';
import { connection } from './notification.queues.js';
import prisma from '../../../config/prisma.js';
import { getProvider } from '../channels/channel.provider.js';
import logger from '../../../shared/utils/logger.js';

// Auto-register providers on import
import '../channels/in-app.provider.js';
import '../channels/email.provider.js';
import '../channels/sms.provider.js';

export let workers = {};

const processNotification = async (job) => {
  const { notificationId } = job.data;

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    logger.error({ notificationId }, '[Worker] Notification not found in database');
    return;
  }

  // If already delivered, don't re-process
  if (notification.deliveryStatus === 'DELIVERED') {
    return;
  }

  try {
    // 1. Update status to SENDING
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'SENDING' },
    });

    await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId,
        eventType: 'SENDING',
      },
    });

    // 2. Resolve Provider & Configuration
    let providerName = 'internal';
    let providerConfig = {};

    if (notification.channel !== 'IN_APP') {
      const channelConfig = await prisma.notificationChannelConfig.findFirst({
        where: {
          tenantId: notification.tenantId,
          channelType: notification.channel,
          isActive: true,
        },
        orderBy: { priority: 'desc' },
      });

      if (!channelConfig) {
        throw new Error(
          `No active provider config for channel ${notification.channel} and tenant ${notification.tenantId}`,
        );
      }

      providerName = channelConfig.providerName;
      providerConfig = channelConfig.providerConfig || {};
    }

    // 3. Retrieve Provider implementation & Dispatch Send
    const provider = getProvider(notification.channel, providerName);
    const result = await provider.send(notification, providerConfig);

    if (result.success) {
      // 4. Update status to DELIVERED
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: 'DELIVERED',
          sentAt: new Date(),
          deliveredAt: new Date(),
          providerMessageId: result.providerMessageId,
          failureReason: null,
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId,
          eventType: 'DELIVERED',
          providerName,
          providerMessageId: result.providerMessageId,
        },
      });

      logger.info(
        { notificationId, channel: notification.channel },
        '[Worker] Notification delivered successfully',
      );
    } else {
      throw new Error(result.errorMessage || 'Unknown delivery failure');
    }
  } catch (error) {
    const errorMessage = error.message;
    const currentRetryCount = notification.retryCount || 0;

    // Fetch tenant notification settings for retry limits
    const settings = await prisma.notificationSettings.findFirst({
      where: { tenantId: notification.tenantId },
    });

    const maxRetries = settings?.maxRetries ?? notification.maxRetries ?? 3;
    const newRetryCount = currentRetryCount + 1;

    logger.warn(
      { notificationId, newRetryCount, maxRetries, error: errorMessage },
      '[Worker] Notification delivery attempt failed',
    );

    if (newRetryCount <= maxRetries) {
      // Mark as RETRYING and update retry count
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: 'RETRYING',
          retryCount: newRetryCount,
          failureReason: errorMessage,
          lastRetryAt: new Date(),
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId,
          eventType: 'RETRYING',
          errorMessage,
        },
      });

      // Propagate error to BullMQ to schedule retry backoff
      throw error;
    } else {
      // Exceeded max retries: mark as FAILED and move to DLQ record
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: 'FAILED',
          failureReason: errorMessage,
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId,
          eventType: 'FAILED',
          errorMessage,
        },
      });

      // Move to NotificationDeadLetter table
      await prisma.notificationDeadLetter.upsert({
        where: { notificationId },
        update: {
          failureReason: errorMessage,
          retryCount: newRetryCount,
          movedAt: new Date(),
        },
        create: {
          notificationId,
          tenantId: notification.tenantId,
          failureReason: errorMessage,
          payload: { jobData: job.data },
          retryCount: newRetryCount,
        },
      });

      logger.error(
        { notificationId },
        '[Worker] Notification moved to DLQ table after max retries',
      );
    }
  }
};

export const createNotificationWorkers = () => {
  const channels = ['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'];

  channels.forEach((channel) => {
    const queueName = `notifications_${channel.toLowerCase()}`;
    workers[channel] = new Worker(queueName, processNotification, {
      connection,
      concurrency: 5,
    });
  });

  logger.info('[Worker] Notification workers initialized');
};
