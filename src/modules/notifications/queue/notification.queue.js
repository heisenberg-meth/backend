import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const notificationQueue = isTest ? null : registerQueue(
  new Queue('viyan-medassist-notifications', {
    connection: getBullRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  }),
);
