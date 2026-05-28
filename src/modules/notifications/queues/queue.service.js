import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';
import logger from '../../../shared/utils/logger.js';

const connection = getBullRedis();

const createQueue = (name) => {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
};

export const queues = {
  sms: registerQueue(createQueue('notification_sms')),
  email: registerQueue(createQueue('notification_email')),
  whatsapp: registerQueue(createQueue('notification_whatsapp')),
  retry: registerQueue(createQueue('notification_retry')),
};

class NotificationQueueService {
  async enqueue(notificationId, channel, payload = {}) {
    const queue = queues[channel.toLowerCase()];
    if (!queue) {
      logger.error({ channel }, 'Unsupported notification channel for queuing');
      throw new Error(`Unsupported channel: ${channel}`);
    }

    const job = await queue.add('send_notification', {
      notificationId,
      ...payload,
    }, {
      jobId: notificationId, // Prevent duplicate queuing for same notification
    });

    logger.info({ notificationId, channel, jobId: job.id }, 'Notification enqueued');
    return job;
  }

  async getMetrics() {
    const metrics = {};
    for (const [name, queue] of Object.entries(queues)) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      metrics[name] = { waiting, active, completed, failed, delayed };
    }
    return metrics;
  }
}

export default new NotificationQueueService();
