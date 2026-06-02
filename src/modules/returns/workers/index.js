import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { processGstRecalculation } from './gst.handler.js';
import { processFraudScan } from './fraud.handler.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'recalculate-gst': processGstRecalculation,
  'scan-return-fraud': processFraudScan,
};

export const returnsWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-returns',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[Returns Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[Returns Worker] Finished job ${job.id} (${job.name})`);
          } else {
            logger.warn(`[Returns Worker] No handler for job type: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 5,
        },
      ),
    );

if (returnsWorker) {
  returnsWorker.on('failed', (job, err) => {
    logger.error(`[Returns Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
