import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import riskMonitoringService from '../services/risk-monitoring.service.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

/**
 * Risk Worker
 * Processes BullMQ jobs for pharmaceutical risk monitoring.
 */
class RiskWorker {
  constructor() {
    this.worker = null;
  }

  setup() {
    if (process.env.NODE_ENV === 'test') return;

    this.worker = new Worker(
      'erp-events',
      async (job) => {
        const { name, data } = job;

        try {
          switch (name) {
            case DOMAIN_EVENTS.STOCK_UPDATED:
              // Sync alert snapshots for this medicine
              await riskMonitoringService.handleStockMovement(data);
              break;

            case 'RUN_GLOBAL_EXPIRY_SCAN': {
              const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
              for (const tenant of tenants) {
                await riskMonitoringService.runExpiryScan(tenant.id);
              }
              break;
            }

            default:
              break;
          }
        } catch (error) {
          const permanentErrors = [
            'P2022',
            'P2025',
            'P2003',
            'P2002',
            'P2014',
            'ZOD_ERROR',
            'UNRECOVERABLE',
          ];
          const errorCode = error.code || '';
          const isPermanent = permanentErrors.some((code) => errorCode.startsWith(code));

          if (isPermanent) {
            logger.error(
              { error: error.message, code: errorCode, event: name, jobId: job.id },
              '[RISK-WORKER] Unrecoverable error — will NOT retry',
            );
            const unrecoverable = new Error(error.message);
            unrecoverable.code = 'UNRECOVERABLE';
            unrecoverable.originalCode = errorCode;
            throw unrecoverable;
          }

          logger.warn(
            { error: error.message, code: errorCode, event: name, attempt: job.attemptsMade },
            '[RISK-WORKER] Transient error — will retry',
          );
          throw error;
        }
      },
      {
        connection: getBullRedis(),
        concurrency: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );

    this.worker.on('failed', (job, err) => {
      const isUnrecoverable = err.code === 'UNRECOVERABLE';
      const logLevel = isUnrecoverable ? 'error' : 'warn';
      logger[logLevel](
        {
          jobId: job.id,
          error: err.message,
          code: err.originalCode || err.code,
          attempts: job.attemptsMade,
          unrecoverable: isUnrecoverable,
        },
        `[RISK-WORKER] Job failed ${isUnrecoverable ? 'permanently (no retry)' : 'after all retries'}`,
      );
    });

    logger.info('[RISK-WORKER] Risk worker started and listening to erp-events queue');
  }
}

const riskWorkerInstance = new RiskWorker();

export const initRiskWorker = () => {
  riskWorkerInstance.setup();
};

export default riskWorkerInstance;
