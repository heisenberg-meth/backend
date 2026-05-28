import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import aggregationService from '../service/aggregation.service.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'nightly-inventory-analysis': async () => {
    await aggregationService.runNightlyInventoryAnalysis();
  },
  'hourly-revenue-aggregation': async () => {
    await aggregationService.runHourlyRevenueAggregation();
  }
};

export const analyticsWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-analytics',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[Analytics Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[Analytics Worker] Finished job ${job.id} (${job.name})`);
          } else {
            logger.warn(`[Analytics Worker] No handler for job type: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 2,
        },
      ),
    );

if (analyticsWorker) {
  analyticsWorker.on('failed', (job, err) => {
    logger.error(`[Analytics Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
