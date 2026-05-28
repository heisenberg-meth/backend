import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const gstReportQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-gst-reports', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
}));

export const gstMonthlyQueue = isTest
  ? null
  : registerQueue(
      new Queue('viyan-medassist-gst-monthly', {
        connection: getBullRedis(),
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 60000 },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      }),
    );
