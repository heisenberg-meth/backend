import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import paymentReconciliationService from '../services/payment.reconciliation.service.js';

function createReconciliationWorker() {
  if (process.env.NODE_ENV === 'test') return null;

  const reconciliationWorker = new Worker(
    'payment-reconciliation',
    async (job) => {
      const { tenantId } = job.data;
      logger.info({ tenantId, jobId: job.id }, '[RECON_WORKER] Starting reconciliation');

      const results = await paymentReconciliationService.reconcileAll(tenantId);
      return results;
    },
    {
      connection: getBullRedis(),
      concurrency: 2,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  reconciliationWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, '[RECON_WORKER] Job failed');
  });

  return reconciliationWorker;
}

function createDeadLetterWorker() {
  if (process.env.NODE_ENV === 'test') return null;

  const dlqWorker = new Worker(
    'payment-dlq',
    async (job) => {
      logger.warn({ jobId: job.id, data: job.data }, '[DLQ_WORKER] Processing dead letter');
      return { status: 'archived' };
    },
    {
      connection: getBullRedis(),
      concurrency: 1,
    },
  );

  dlqWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, '[DLQ_WORKER] Job failed');
  });

  return dlqWorker;
}

export { createReconciliationWorker, createDeadLetterWorker };
