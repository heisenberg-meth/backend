import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import aggregationService from '../aggregations/aggregation.service.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

/**
 * Analytics Worker
 * Processes BullMQ events for pre-aggregating financial data.
 */
class AnalyticsWorker {
  constructor() {
    this.worker = null;
  }

  setup() {
    if (process.env.NODE_ENV === 'test') return;

    this.worker = new Worker(
      'erp-events',
      async (job) => {
        const { name, data } = job;
        logger.info({ event: name }, '[ANALYTICS-WORKER] Processing event');

        try {
          switch (name) {
            case DOMAIN_EVENTS.INVOICE_GENERATED: {
              const invoice =
                data.invoice ||
                (await prisma.invoice.findUnique({
                  where: { id: data.invoiceId },
                  include: { items: true },
                }));
              if (invoice) await aggregationService.handleInvoiceGenerated(invoice);
              break;
            }

            case 'PAYMENT_SETTLED':
            case DOMAIN_EVENTS.PAYMENT_RECEIVED:
              await aggregationService.handlePaymentSettled(data);
              break;

            case DOMAIN_EVENTS.REFUND_PROCESSED:
              await aggregationService.handleRefundProcessed(data);
              break;

            default:
              logger.debug({ event: name }, '[ANALYTICS-WORKER] Skipping unhandled event');
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
              '[ANALYTICS-WORKER] Unrecoverable error — will NOT retry',
            );
            const unrecoverable = new Error(error.message);
            unrecoverable.code = 'UNRECOVERABLE';
            unrecoverable.originalCode = errorCode;
            throw unrecoverable;
          }

          logger.warn(
            { error: error.message, code: errorCode, event: name, attempt: job.attemptsMade },
            '[ANALYTICS-WORKER] Transient error — will retry',
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

    this.worker.on('completed', (job) => {
      logger.debug({ jobId: job.id }, '[ANALYTICS-WORKER] Job completed');
    });

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
        `[ANALYTICS-WORKER] Job failed ${isUnrecoverable ? 'permanently (no retry)' : 'after all retries'}`,
      );
    });

    logger.info('[ANALYTICS-WORKER] Analytics worker started and listening to erp-events queue');
  }
}

const analyticsWorkerInstance = new AnalyticsWorker();

export const initAnalyticsWorker = () => {
  analyticsWorkerInstance.setup();
};

export default analyticsWorkerInstance;
