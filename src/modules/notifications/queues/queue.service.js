import { getQueueForChannel, buildBackoffConfig } from './notification.queues.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class NotificationQueueService {
  async enqueue(notificationId, channel, payload = {}) {
    const upperChannel = channel.toUpperCase();
    const queue = getQueueForChannel(upperChannel);

    // Fetch tenant settings for dynamic retry configs
    const settings = await prisma.notificationSettings.findFirst({
      where: { tenantId: payload.tenantId },
    });

    const backoff = buildBackoffConfig(settings);
    const maxRetries = settings?.maxRetries ?? 3;

    const job = await queue.add(
      'send_notification',
      {
        notificationId,
        ...payload,
      },
      {
        jobId: notificationId, // Prevent duplicate queuing
        attempts: maxRetries,
        backoff,
      },
    );

    logger.info(
      { notificationId, channel: upperChannel, jobId: job.id },
      'Notification enqueued to BullMQ',
    );
    return job;
  }

  async getMetrics() {
    const channels = ['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'];
    const metrics = {};
    for (const channel of channels) {
      try {
        const queue = getQueueForChannel(channel);
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);
        metrics[channel] = { waiting, active, completed, failed, delayed };
      } catch (err) {
        metrics[channel] = { error: err.message };
      }
    }
    return metrics;
  }
}

export default new NotificationQueueService();
