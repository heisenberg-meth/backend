import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerWorker } from '../../../config/queue-registry.js';
import prescriptionService from '../services/prescription.service.js';
import ocrService from '../services/ocr.service.js';
import refillService from '../services/refill.service.js';
import logger from '../../../shared/utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'process-ocr': async (data) => {
    const { text, tenantId } = data;
    logger.info('[Prescription Worker] Processing OCR');
    return ocrService.processOcr(text, tenantId);
  },

  'check-expiry': async () => {
    logger.info('[Prescription Worker] Checking prescription expiry');
    return prescriptionService.checkExpiry();
  },

  'check-refills': async (data) => {
    const { tenantId } = data;
    logger.info('[Prescription Worker] Checking due refills');
    return refillService.checkDueRefills(tenantId);
  },
};

export const prescriptionOcrWorker = isTest ? null : registerWorker(new Worker(
  'viyan-medassist-prescription-ocr',
  async (job) => {
    const handler = handlers[job.name];
    if (handler) {
      logger.info(`[Prescription Worker] Started ${job.id} (${job.name})`);
      await handler(job.data);
    }
  },
  { connection: getBullRedis(), concurrency: 3 },
));

export const refillReminderWorker = isTest ? null : registerWorker(new Worker(
  'viyan-medassist-refill-reminders',
  async (job) => {
    const handler = handlers[job.name];
    if (handler) await handler(job.data);
  },
  { connection: getBullRedis(), concurrency: 2 },
));

export const prescriptionExpiryWorker = isTest ? null : registerWorker(new Worker(
  'viyan-medassist-prescription-expiry',
  async (job) => {
    const handler = handlers[job.name];
    if (handler) await handler(job.data);
  },
  { connection: getBullRedis(), concurrency: 2 },
));

if (prescriptionOcrWorker) {
  prescriptionOcrWorker.on('failed', (job, err) => {
    logger.error(`[Prescription Worker] ${job?.id} failed: ${err.message}`);
  });
}
