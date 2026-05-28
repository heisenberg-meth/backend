import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { processSms } from './sms.handler.js';
import { processWhatsapp } from './whatsapp.handler.js';
import { processEmail } from './email.handler.js';
import { processExpiryReminder } from './expiry-reminder.handler.js';
import { processReorderAlert } from './reorder-alert.handler.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'send-sms': processSms,
  'send-whatsapp': processWhatsapp,
  'send-email': processEmail,
  'expiry-reminder': processExpiryReminder,
  'reorder-alert': processReorderAlert,
};

export const notificationWorker = isTest ? null : registerWorker(
  new Worker(
    'viyan-medassist-notifications',
    async (job) => {
      const handler = handlers[job.name];
      if (handler) {
        logger.info(`[Notification Worker] Started job ${job.id} (${job.name})`);
        await handler(job.data);
        logger.info(`[Notification Worker] Finished job ${job.id} (${job.name})`);
      } else {
        logger.warn(`[Notification Worker] No handler for job type: ${job.name}`);
      }
    },
    {
      connection: getBullRedis(),
      concurrency: 10,
    },
  ),
);

if (notificationWorker) {
  notificationWorker.on('failed', (job, err) => {
    logger.error(`[Notification Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
