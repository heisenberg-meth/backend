import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const invoiceDeliveryQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-invoice-delivery', {
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
}));

export const invoicePrintQueue = isTest
  ? null
  : registerQueue(
      new Queue('viyan-medassist-invoice-print', {
        connection: getBullRedis(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30000,
          },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      }),
    );
