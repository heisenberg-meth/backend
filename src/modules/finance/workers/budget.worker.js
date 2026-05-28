import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const financeWorker = isTest ? null : new Worker('erp-events', async (job) => {
  if (job.name === 'PROCUREMENT_REQUEST_CREATED') {
    const requestId = job.data;
    logger.info({ requestId }, '[FINANCE_WORKER] Validating budget for procurement request');
  }
}, { connection: getBullRedis() });

if (financeWorker) {
  financeWorker.on('failed', (job, err) => {
    logger.error({ job, err }, '[FINANCE_WORKER] Job failed');
  });
}

export default financeWorker;
