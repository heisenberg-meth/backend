import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { processIndexSync } from './index.handler.js';
import { processAnalyticsAggregation } from './analytics.handler.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'sync-search-index': processIndexSync,
  'aggregate-search-analytics': processAnalyticsAggregation,
};

export const medicineSearchWorker = isTest ? null : registerWorker(
  new Worker(
    'viyan-medassist-medicine-search',
    async (job) => {
      const handler = handlers[job.name];
      if (handler) {
        logger.info(`[Medicine Search Worker] Started job ${job.id} (${job.name})`);
        await handler(job.data);
        logger.info(`[Medicine Search Worker] Finished job ${job.id} (${job.name})`);
      } else {
        logger.warn(`[Medicine Search Worker] No handler for job type: ${job.name}`);
      }
    },
    {
      connection: getBullRedis(),
      concurrency: 5,
    },
  ),
);

if (medicineSearchWorker) {
  medicineSearchWorker.on('failed', (job, err) => {
    logger.error(`[Medicine Search Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
