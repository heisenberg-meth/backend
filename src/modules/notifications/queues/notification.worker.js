import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import prisma from '../../../config/prisma.js';
import providerRegistry from '../providers/provider-registry.js';
import recoveryService from '../recovery/recovery.service.js';
import logger from '../../../shared/utils/logger.js';

const connection = getBullRedis();

const createWorker = (queueName, handler) => {
  return new Worker(queueName, handler, {
    connection,
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
    // 1. Update status to PROCESSING
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

    // 2. Perform Delivery with Failover
    const deliveryResult = await providerRegistry.sendWithFailover(
      notification.tenantId,
      notification.channel,
      async (provider) => {
        // Here we would call the actual provider implementation (e.g. twilio, resend)
        // For the sake of this architectural implementation, we simulate provider call
        logger.info({ notificationId, provider: provider.providerName }, 'Attempting delivery via provider');
        
        // Mock success for now, in real app call providerService.send(notification, provider)
        return { messageId: `provider-${Date.now()}` };
      }
    );

    if (deliveryResult.success) {
      // 3. Update status to SENT/DELIVERED
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

    logger.warn({ notificationId, retryCount, error: errorMessage }, 'Notification processing failed');

    if (retryCount < notification.maxRetries) {
      // Automatic retry handled by BullMQ backoff or manual logic
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
      
      throw error; // Let BullMQ handle retry
    } else {
      // Move to DLQ
      await recoveryService.moveToDLQ(notificationId, errorMessage, job.data);
    }
  }
};

export const workers = {
  sms: createWorker('notification_sms', processNotification),
  email: createWorker('notification_email', processNotification),
  whatsapp: createWorker('notification_whatsapp', processNotification),
  retry: createWorker('notification_retry', processNotification),
};

logger.info('Notification workers initialized');
