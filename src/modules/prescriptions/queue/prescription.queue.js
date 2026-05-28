import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const prescriptionOcrQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-prescription-ocr', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: true,
    removeOnFail: 50,
  },
}));

export const refillReminderQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-refill-reminders', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: true,
    removeOnFail: 20,
  },
}));

export const prescriptionExpiryQueue = isTest ? null : registerQueue(new Queue('viyan-medassist-prescription-expiry', {
  connection: getBullRedis(),
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: true,
    removeOnFail: 20,
  },
}));
