import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import paymentRecoveryService from '../services/payment.recovery.service.js';
import paymentReconciliationService from '../services/payment.reconciliation.service.js';

function createRecoveryWorker() {
  if (process.env.NODE_ENV === 'test') return null;

  const recoveryWorker = new Worker(
    'payment-recovery',
    async (job) => {
      const { type, tenantId } = job.data;
      logger.info({ type, jobId: job.id }, '[RECOVERY_WORKER] Processing job');

      switch (type) {
        case 'recover_orphans':
          return paymentRecoveryService.recoverOrphanedPayments(tenantId);
        case 'detect_stuck':
          return paymentRecoveryService.detectStuckPayments();
        case 'reconcile':
          return paymentReconciliationService.reconcileAll(tenantId);
        default:
          logger.warn({ type }, '[RECOVERY_WORKER] Unknown job type');
      }
    },
    {
      connection: getBullRedis(),
      concurrency: 3,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    }
  );

  recoveryWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, '[RECOVERY_WORKER] Job failed');
  });

  recoveryWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, returnValue: job.returnvalue }, '[RECOVERY_WORKER] Job completed');
  });

  return recoveryWorker;
}

export { createRecoveryWorker };
export default createRecoveryWorker;
