import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import razorpayWebhookHandler from '../../payments/webhooks/razorpay.webhook.js';

const isTest = process.env.NODE_ENV === 'test';

const webhookWorker = isTest
  ? null
  : new Worker(
      'webhook-queue',
      async (job) => {
        const { provider, eventType, payload, signature } = job.data;
        logger.info({ provider, eventType, jobId: job.id }, '[WEBHOOK_WORKER] Processing');

        if (provider === 'razorpay') {
          const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
          const isValid = razorpayWebhookHandler.verifySignature(
            body,
            signature || job.data.signature,
          );
          if (!isValid) {
            throw new Error('Invalid webhook signature in worker');
          }

          await razorpayWebhookHandler.processWebhook(eventType, {
            ...payload,
            signature: signature || job.data.signature,
          });
        }
      },
      {
        connection: getBullRedis(),
        concurrency: 5,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    );

if (webhookWorker) {
  webhookWorker.on('failed', (job, err) => {
    logger.error(
      { job: job?.id, error: err.message, attempts: job?.attemptsMade },
      '[WEBHOOK_WORKER] Job failed',
    );
  });
}

export default webhookWorker;
