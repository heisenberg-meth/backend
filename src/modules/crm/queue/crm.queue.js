import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const crmQueue = isTest
  ? null
  : registerQueue(
      new Queue('viyan-medassist-crm', {
        connection: getBullRedis(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 60000,
          },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      }),
    );
