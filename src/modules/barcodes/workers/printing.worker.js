import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import printingService from '../services/printing.service.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const printingWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-printing',
        async (job) => {
          if (job.name === 'bulk-print') {
            logger.info(`[Printing Worker] Started bulk print job ${job.id}`);
            await printingService.processBulkPrint(job.data);
            logger.info(`[Printing Worker] Finished bulk print job ${job.id}`);
          } else {
            logger.warn(`[Printing Worker] Unknown job name: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 5,
        },
      ),
    );

if (printingWorker) {
  printingWorker.on('failed', (job, err) => {
    logger.error(`[Printing Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
