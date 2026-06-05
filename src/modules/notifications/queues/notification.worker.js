import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import prisma from '../../../config/prisma.js';
import providerRegistry from '../providers/provider-registry.js';
import recoveryService from '../recovery/recovery.service.js';
import logger from '../../../shared/utils/logger.js';

export let workers = null;

const createWorker = (queueName, handler) => {
  return new Worker(queueName, handler, {
    connection: getBullRedis(),
    concurrency: 5,
  });
};

const processNotification = async (job) => {
  const { notificationId } = job.data;
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    logger.error({ notificationId }, 'Notification not found in worker');
    return;
  }

  try {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'PROCESSING' },
    });

    await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId,
        eventType: 'PROCESSING',
      },
    });

    const deliveryResult = await providerRegistry.sendWithFailover(
      notification.tenantId,
      notification.channel,
      async (provider) => {
        logger.info(
          { notificationId, provider: provider.providerName },
          'Attempting delivery via provider',
        );
        return { messageId: `provider-${Date.now()}` };
      },
    );

    if (deliveryResult.success) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: 'SENT',
          sentAt: new Date(),
          providerMessageId: deliveryResult.result.messageId,
          failureReason: null,
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId,
          eventType: 'SENT',
          providerName: deliveryResult.providerName,
          providerMessageId: deliveryResult.result.messageId,
        },
      });

      logger.info({ notificationId }, 'Notification sent successfully');
    } else {
      throw new Error(JSON.stringify(deliveryResult.errors));
    }
  } catch (error) {
    const errorMessage = error.message;
    const retryCount = (notification.retryCount || 0) + 1;

    logger.warn(
      { notificationId, retryCount, error: errorMessage },
      'Notification processing failed',
    );

    if (retryCount < notification.maxRetries) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          deliveryStatus: 'FAILED',
          failureReason: errorMessage,
          retryCount,
        },
      });

      await prisma.notificationDeliveryEvent.create({
        data: {
          notificationId,
          eventType: 'FAILED',
          errorMessage,
        },
      });

      throw error;
    } else {
      await recoveryService.moveToDLQ(notificationId, errorMessage, job.data);
    }
  }
};

export const createNotificationWorkers = () => {
  workers = {
    sms: createWorker('notification_sms', processNotification),
    email: createWorker('notification_email', processNotification),
    whatsapp: createWorker('notification_whatsapp', processNotification),
    retry: createWorker('notification_retry', processNotification),
  };
  logger.info('Notification workers initialized');
};
