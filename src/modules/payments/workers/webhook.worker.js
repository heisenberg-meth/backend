import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import razorpayWebhookHandler from '../webhooks/razorpay.webhook.js';

function createWebhookWorker() {
  if (process.env.NODE_ENV === 'test') return null;

  const webhookWorker = new Worker(
    'payment-webhook',
    async (job) => {
      const { event, payload } = job.data;
      logger.info({ event, jobId: job.id }, '[WEBHOOK_WORKER] Processing webhook');

      const result = await razorpayWebhookHandler.processWebhook(event, payload);
      return result;
    },
    {
      connection: getBullRedis(),
      concurrency: 5,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  webhookWorker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, attempt: job?.attemptsMade },
      '[WEBHOOK_WORKER] Job failed',
    );
  });

  webhookWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id, result: job.returnvalue }, '[WEBHOOK_WORKER] Completed');
  });

  return webhookWorker;
}

export { createWebhookWorker };
export default createWebhookWorker;
