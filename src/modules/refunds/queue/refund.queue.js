import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const refundApprovalQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-refund-approval', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
}));

export const refundPaymentQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-refund-payment', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
}));
