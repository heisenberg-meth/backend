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

    this.worker = new Worker('erp-events', async (job) => {
      const { name, data } = job;
      logger.info({ event: name }, '[ANALYTICS-WORKER] Processing event');

      try {
        switch (name) {
          case DOMAIN_EVENTS.INVOICE_GENERATED: {
            // Fetch full invoice if only ID was passed, or use data if full object
            const invoice =
              data.invoice ||
              (await prisma.invoice.findUnique({
                where: { id: data.invoiceId },
                include: { items: true },
              }));
            if (invoice) await aggregationService.handleInvoiceGenerated(invoice);
            break;
          }

          case 'PAYMENT_SETTLED': // Custom event from SettlementService
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
        // Classify errors: permanent (no retry) vs transient (retry)
        const permanentErrors = [
          'P2022', // Column does not exist (schema mismatch)
          'P2025', // Record not found
          'P2003', // Foreign key constraint violation
          'P2002', // Unique constraint violation
          'P2014', // Relation violation
          'ZOD_ERROR', // Validation error
          'UNRECOVERABLE', // Explicit unrecoverable error
        ];

        const errorCode = error.code || '';
        const isPermanent = permanentErrors.some(code => errorCode.startsWith(code));

        if (isPermanent) {
          logger.error(
            { error: error.message, code: errorCode, event: name, jobId: job.id },
            '[ANALYTICS-WORKER] Unrecoverable error — will NOT retry'
          );
          // Throw with special flag to prevent BullMQ retries
          const unrecoverable = new Error(error.message);
          unrecoverable.code = 'UNRECOVERABLE';
          unrecoverable.originalCode = errorCode;
          throw unrecoverable;
        }

        // Transient errors: network, deadlock, timeout — safe to retry
        logger.warn(
          { error: error.message, code: errorCode, event: name, attempt: job.attemptsMade },
          '[ANALYTICS-WORKER] Transient error — will retry'
        );
        throw error;
      }
    }, {
      connection: getBullRedis(),
      concurrency: 5,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

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
        `[ANALYTICS-WORKER] Job failed ${isUnrecoverable ? 'permanently (no retry)' : 'after all retries'}`
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
