import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const analyticsQueue = isTest
  ? null
  : registerQueue(
      new Queue('viyan-medassist-analytics', {
        connection: getBullRedis(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000,
          },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      }),
    );
