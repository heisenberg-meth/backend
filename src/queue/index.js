import { Queue, Worker } from 'bullmq';
import { getBullRedis } from '../config/redis.js';
import logger from '../shared/utils/logger.js';
import * as emailService from '../shared/services/email.service.js';
import prisma from '../config/prisma.js';
import alertService from '../modules/stock/service/alert.service.js';
import snapshotService from '../modules/stock/service/snapshot.service.js';
import analyticsService from '../modules/sales/services/analytics.service.js';
import expiryService from '../modules/expiry-intelligence/services/expiry.service.js';
import recommendationService from '../modules/expiry-intelligence/services/recommendation.service.js';
import smsRepository from '../modules/patients/repositories/sms.repository.js';
import loyaltyService from '../modules/patients/services/loyalty.service.js';
import gstService from '../modules/finance/services/gst.service.js';
import ocrService from '../modules/prescriptions/services/ocr.service.js';
import dispatchService from '../modules/delivery/services/dispatch.service.js';
import inventorySyncService from '../modules/ecommerce/services/inventory-sync.service.js';
import insuranceService from '../modules/prescriptions/services/insurance.service.js';
import derivationService from '../modules/stock/services/derivation.service.js';
import { registerQueue, registerWorker } from '../config/queue-registry.js';
import {
  processRefillPredictions,
  processAdherenceScoring as processRefillAdherence,
  processScheduledReminders,
} from '../modules/refill-reminders/scheduling/refill.jobs.js';
import { processPrescriptionExpiryCheck } from '../modules/patient-features/jobs/prescription-expiry.job.js';

const QUEUE_NAME = 'viyan-medassist-main';

// Do NOT start queues or workers during tests
const isTest = process.env.NODE_ENV === 'test';

let mainQueueInstance = null;
let workerInstance = null;

if (!isTest) {
  mainQueueInstance = registerQueue(
    new Queue(QUEUE_NAME, {
      connection: getBullRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  );
} else {
  // Provide a dummy queue for tests to prevent null pointer errors
  mainQueueInstance = {
    add: async () => ({ id: 'mock-job-id' }),
    on: () => {},
    close: async () => {},
  };
}

const handlers = {
  'send-email': async (data) => {
    const { to, subject, html } = data;
    await emailService.sendEmail(to, subject, html);
  },

  'log-audit': async (data) => {
    await prisma.auditLog.create({
      data: {
        ...data,
        date: new Date(),
      },
    });
  },

  'process-csv-import': async (data) => {
    logger.info(`Processing CSV import for tenant: ${data.tenantId}`);
    const { jobId, tenantId } = data;
    if (jobId && tenantId) {
      const { default: importService } =
        await import('../modules/import/services/import.service.js');
      await importService.processImportJob(jobId, tenantId);
    }
  },

  'update-analytics': async (data) => {
    const cacheKey = `stats:dashboard:${data.tenantId}`;
    await getBullRedis().del(cacheKey);
  },

  'daily-stock-snapshot': async () => {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    for (const tenant of tenants) {
      logger.info(`Capturing daily snapshots for tenant: ${tenant.id}`);
      await snapshotService.captureDailySnapshots(tenant.id);
    }
  },

  'daily-expiry-check': async () => {
    logger.info('Starting daily expiry checks...');
    await alertService.processDailyExpiryChecks();
  },

  'daily-sales-summary': async () => {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    for (const tenant of tenants) {
      logger.info(`Generating daily sales summary for tenant: ${tenant.id}`);
      await analyticsService.generateDailySummary(tenant.id, new Date());
    }
  },

  'expiry-scan': async () => {
    logger.info('Starting periodic expiry scan...');
    await expiryService.processExpiryScan();
  },

  'expiry-recommendation': async () => {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    for (const tenant of tenants) {
      logger.info(`Generating expiry recommendations for tenant: ${tenant.id}`);
      await recommendationService.generateRecommendations(tenant.id);
    }
  },

  'supplier-overdue-scan': async () => {
    logger.info('Starting supplier overdue scan...');
    const now = new Date();
    await prisma.purchaseInvoice.updateMany({
      where: {
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: now },
      },
      data: { paymentStatus: 'OVERDUE' },
    });
  },

  'send-sms': async (data) => {
    const { notificationId, phone, message } = data;
    try {
      const { default: smsService } =
        await import('../modules/notifications/services/sms.service.js');
      logger.info(`[SMS] Sending to ${phone}`);
      await smsService.send(phone, message);
      await smsRepository.updateStatus(notificationId, 'SENT');
    } catch (err) {
      logger.error({ err }, `[SMS] Failed to send to ${phone}`);
      await smsRepository.updateStatus(notificationId, 'FAILED', err.message);
      throw err; // Trigger BullMQ retry mechanism
    }
  },

  'loyalty-expiry': async () => {
    logger.info('Starting daily loyalty points expiry check...');
    await loyaltyService.expireOldPoints();
  },

  'gst-aggregation': async () => {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    for (const tenant of tenants) {
      logger.info(`Aggregating GST for tenant: ${tenant.id}`);
      await gstService.generateMonthlySummary(tenant.id, lastMonth);
    }
  },

  'process-ocr': async (data) => {
    const { prescriptionId, fileUrl } = data;
    try {
      const text = await ocrService.extractText(fileUrl);
      await prisma.prescription.update({
        where: { id: prescriptionId },
        data: { extractedText: text },
      });
      logger.info(`[OCR] Successfully processed prescription: ${prescriptionId}`);
    } catch (err) {
      logger.error({ err }, `[OCR] Failed to process prescription: ${prescriptionId}`);
    }
  },

  'auto-assign-rider': async (data) => {
    const { tenantId, deliveryId } = data;
    await dispatchService.assignRider(tenantId, deliveryId);
  },

  'sync-inventory-storefront': async (data) => {
    const { logId, tenantId, medicineId } = data;
    await inventorySyncService.performSync(logId, tenantId, medicineId);
  },

  'verify-insurance-claim': async (data) => {
    const { claimId, tenantId } = data;
    await insuranceService.verifyClaim(claimId, tenantId);
  },

  'process-import-job': async (data) => {
    const { jobId, tenantId } = data;
    const { default: importService } = await import('../modules/import/services/import.service.js');
    await importService.processImportJob(jobId, tenantId);
  },

  'bulk-medicines-import': async (data) => {
    const {
      filePath,
      jobId,
      tenantId,
      branchId,
      userId,
      duplicateStrategy,
      barcodeOptions,
      supplier,
    } = data;
    const { default: csvImportService } =
      await import('../modules/import/services/csv-import.service.js');
    await csvImportService.run(filePath, {
      jobId,
      tenantId,
      branchId,
      userId,
      duplicateStrategy,
      barcodeOptions,
      supplier: supplier || 'None',
    });
  },

  'inventory-reconciliation': async () => {
    logger.info('Starting inventory reconciliation & drift detection...');
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    for (const tenant of tenants) {
      logger.info(`Reconciling inventory for tenant: ${tenant.id}`);
      const medicines = await prisma.medicine.findMany({
        where: { tenantId: tenant.id, deletedAt: null },
      });
      for (const medicine of medicines) {
        try {
          const result = await derivationService.verifyStockIntegrity(tenant.id, medicine.id);
          if (result.status === 'DRIFT') {
            logger.warn(
              `[INVENTORY_DRIFT] Tenant: ${tenant.id}, Medicine: ${medicine.id}, Derived: ${result.derivedQuantity}, Recorded: ${result.recordedQuantity}, Drift: ${result.drift}`,
            );
          }
        } catch (error) {
          logger.error(
            { error },
            `[INVENTORY_RECONCILIATION_ERROR] Tenant: ${tenant.id}, Medicine: ${medicine.id}`,
          );
        }
      }
    }
    logger.info('Inventory reconciliation completed.');
  },

  'patient-refill-reminders': async () => {
    logger.info('[REFILL] Starting automated reminders...');
    await processScheduledReminders();
  },

  'patient-adherence-scoring': async () => {
    logger.info('[REFILL] Starting automated adherence scoring...');
    await processRefillAdherence();
  },

  'patient-refill-prediction': async () => {
    logger.info('[REFILL] Starting automated refill prediction...');
    await processRefillPredictions();
  },

  'patient-prescription-expiry': async () => {
    logger.info('[PATIENT] Starting prescription expiry check job...');
    await processPrescriptionExpiryCheck();
  },

  'daily-subscription-checks': async () => {
    logger.info('[SUBSCRIPTION] Starting daily subscription checks...');
    const { sendTrialEndingReminder, sendSubscriptionExpiredEmail } =
      await import('../shared/services/email.service.js');

    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      include: {
        subscription: true,
        users: { where: { role: 'OWNER', deletedAt: null }, take: 1 },
      },
    });

    for (const tenant of tenants) {
      const sub = tenant.subscription;
      if (!sub || !sub.endDate) continue;

      const daysLeft = Math.ceil((new Date(sub.endDate) - new Date()) / (1000 * 60 * 60 * 24));
      const owner = tenant.users[0];
      if (!owner) continue;

      if (sub.status === 'TRIAL' && daysLeft <= 0) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED' },
        });
        await sendSubscriptionExpiredEmail(owner.email, owner.fullName);
        logger.info(`[SUBSCRIPTION] Expired trial for tenant: ${tenant.id}`);
      } else if (sub.status === 'TRIAL' && [21, 25, 27].includes(daysLeft)) {
        await sendTrialEndingReminder(owner.email, owner.fullName, daysLeft);
        logger.info(
          `[SUBSCRIPTION] Sent trial ending reminder (${daysLeft}d) for tenant: ${tenant.id}`,
        );
      }
    }
    logger.info('[SUBSCRIPTION] Daily subscription checks completed.');
  },

  'subscription-trial-started': async (data) => {
    const { tenantId } = data;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { users: { where: { role: 'OWNER', deletedAt: null }, take: 1 } },
    });
    if (tenant?.users?.[0]) {
      const { sendWelcomeEmail } = await import('../shared/services/email.service.js');
      await sendWelcomeEmail(tenant.users[0].email, tenant.users[0].fullName);
    }
  },
};

if (!isTest) {
  workerInstance = registerWorker(
    new Worker(
      QUEUE_NAME,
      async (job) => {
        const handler = handlers[job.name];
        if (handler) {
          logger.info(`[BULLMQ] Started job ${job.id} (${job.name})`);
          await handler(job.data);
          logger.info(`[BULLMQ] Finished job ${job.id} (${job.name})`);
        } else {
          logger.warn(`[BULLMQ] No handler for job type: ${job.name}`);
        }
      },
      {
        connection: getBullRedis(),
        concurrency: 5,
      },
    ),
  );

  workerInstance.on('failed', (job, err) => {
    logger.error(`[BULLMQ] Job ${job?.id} failed: ${err.message}`);

    // DLQ handling for exhausted attempts
    if (job && job.attemptsMade >= job.opts.attempts) {
      logger.error(
        `[BULLMQ_DLQ] Job ${job.id} (${job.name}) permanently failed. Moved to Dead Letter log. Payload: ${JSON.stringify(job.data)}`,
      );
      // Here we could persist to a DLQ Postgres table if required
    }
  });
}

export const mainQueue = mainQueueInstance;
export const worker = workerInstance;
