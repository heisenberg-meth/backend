import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { processPdfGeneration } from './pdf.handler.js';
import { processWhatsappDelivery } from './whatsapp.handler.js';
import { processEmailDelivery } from './email.handler.js';
import { processPrintJob } from './print.handler.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'generate-invoice-pdf': processPdfGeneration,
  'send-invoice-whatsapp': processWhatsappDelivery,
  'send-invoice-email': processEmailDelivery,
  'process-print-job': processPrintJob,
};

export const invoiceDeliveryWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-invoice-delivery',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[Invoice Delivery Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[Invoice Delivery Worker] Finished job ${job.id} (${job.name})`);
          } else {
            logger.warn(`[Invoice Delivery Worker] No handler for job type: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 10,
        },
      ),
    );

export const invoicePrintWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-invoice-print',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[Invoice Print Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[Invoice Print Worker] Finished job ${job.id} (${job.name})`);
          } else {
            logger.warn(`[Invoice Print Worker] No handler for job type: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 5,
        },
      ),
    );

if (invoiceDeliveryWorker) {
  invoiceDeliveryWorker.on('failed', (job, err) => {
    logger.error(`[Invoice Delivery Worker] Job ${job?.id} failed: ${err.message}`);
  });
}

if (invoicePrintWorker) {
  invoicePrintWorker.on('failed', (job, err) => {
    logger.error(`[Invoice Print Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
