import { Queue, Worker } from 'bullmq';
import redisClientProxy, { getBullRedis } from '../config/redis.js';
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
    await redisClientProxy.del(cacheKey);
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

  'disposal-integrity-check': async () => {
    logger.info('[Integrity] Checking disposal data consistency...');
    const orphans = await prisma.inventoryBatch.findMany({
      where: {
        status: 'EXPIRED',
        inventoryDisposals: { some: {} },
      },
      select: { id: true, batchNumber: true, quantity: true, status: true },
    });

    if (orphans.length > 0) {
      logger.warn(
        { count: orphans.length, batches: orphans.map((o) => o.id) },
        `[Integrity] ${orphans.length} disposed batches still marked EXPIRED - auto-repairing`,
      );
      await prisma.inventoryBatch.updateMany({
        where: { id: { in: orphans.map((o) => o.id) } },
        data: { status: 'ARCHIVED' },
      });
      logger.info(`[Integrity] Auto-repaired ${orphans.length} disposed batches`);
    } else {
      logger.info('[Integrity] Disposal data consistent - no orphaned batches found');
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
    logger.info('Starting inventory & supplier reconciliation...');
    try {
      // 1. Monitor and alert on discrepancies between Inventory table and InventoryBatch aggregates
      const discrepancies = await prisma.$queryRaw`
        SELECT 
          i."id", i."tenantId", i."branchId", i."medicineId", 
          i."currentStock", 
          COALESCE(SUM(b."quantity"), 0) as "batchStock"
        FROM "Inventory" i
        LEFT JOIN "InventoryBatch" b 
          ON b."medicineId" = i."medicineId" 
          AND (b."branchId" = i."branchId" OR (b."branchId" IS NULL AND i."branchId" IS NULL))
          AND b."tenantId" = i."tenantId"
          AND b."deletedAt" IS NULL
        GROUP BY i."id", i."tenantId", i."branchId", i."medicineId", i."currentStock"
        HAVING i."currentStock" != COALESCE(SUM(b."quantity"), 0)
      `;

      if (discrepancies.length > 0) {
        logger.warn(
          { count: discrepancies.length, discrepancies },
          '[INTEGRITY_ALERT] Discrepancies found between Inventory.currentStock and InventoryBatch totals before reconciliation.',
        );
      } else {
        logger.info(
          '[INTEGRITY_ALERT] No discrepancies found between Inventory.currentStock and InventoryBatch totals.',
        );
      }

      // Reconcile Inventory currentStock with sum of InventoryBatch quantities
      const inventoryReconciled = await prisma.$executeRaw`
        UPDATE "Inventory" i
        SET "currentStock" = COALESCE((
          SELECT SUM("quantity")
          FROM "InventoryBatch" b
          WHERE b."medicineId" = i."medicineId"
            AND b."branchId" = i."branchId"
            AND b."tenantId" = i."tenantId"
            AND b."deletedAt" IS NULL
        ), 0)
        WHERE "currentStock" != COALESCE((
          SELECT SUM("quantity")
          FROM "InventoryBatch" b
          WHERE b."medicineId" = i."medicineId"
            AND b."branchId" = i."branchId"
            AND b."tenantId" = i."tenantId"
            AND b."deletedAt" IS NULL
        ), 0);
      `;
      logger.info(
        `[RECONCILIATION] Reconciled ${inventoryReconciled} Inventory records with Batch sums.`,
      );

      // Reconcile Supplier outstandingBalance with SupplierLedger balance
      const supplierReconciled = await prisma.$executeRaw`
        UPDATE "Supplier" s
        SET "outstandingBalance" = COALESCE((
          SELECT "balanceAfter"
          FROM "SupplierLedger" l
          WHERE l."supplierId" = s."id"
          ORDER BY "createdAt" DESC
          LIMIT 1
        ), 0)
        WHERE "outstandingBalance" != COALESCE((
          SELECT "balanceAfter"
          FROM "SupplierLedger" l
          WHERE l."supplierId" = s."id"
          ORDER BY "createdAt" DESC
          LIMIT 1
        ), 0);
      `;
      logger.info(
        `[RECONCILIATION] Reconciled ${supplierReconciled} Supplier balances with Ledger.`,
      );
    } catch (error) {
      logger.error({ error }, '[RECONCILIATION_ERROR] Failed to run SQL reconciliation scripts.');
    }

    // Existing integrity checks for StockMovement vs InventoryBatch
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    for (const tenant of tenants) {
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
    logger.info('Inventory and Supplier reconciliation completed.');
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

    const now = new Date();

    for (const tenant of tenants) {
      const sub = tenant.subscription;
      if (!sub) continue;

      const expiryDate = sub.status === 'TRIAL' ? sub.trialExpiresAt : sub.endDate;
      if (!expiryDate) continue;

      const daysLeft = Math.ceil((new Date(expiryDate) - now) / (1000 * 60 * 60 * 24));
      const owner = tenant.users[0];

      if (sub.status === 'TRIAL' && daysLeft <= 0) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'EXPIRED' },
        });

        await prisma.subscriptionHistory.create({
          data: {
            tenantId: tenant.id,
            subscriptionId: sub.id,
            action: 'TRIAL_EXPIRED',
            oldStatus: 'TRIAL',
            newStatus: 'EXPIRED',
            oldExpiry: sub.trialExpiresAt,
            newExpiry: sub.trialExpiresAt,
          },
        });

        if (owner) {
          await sendSubscriptionExpiredEmail(owner.email, owner.fullName);
        }

        logger.info(`[SUBSCRIPTION] Expired trial for tenant: ${tenant.id}`);
      } else if (sub.status === 'TRIAL' && [7, 3, 1].includes(daysLeft)) {
        if (owner) {
          await sendTrialEndingReminder(owner.email, owner.fullName, daysLeft);

          await prisma.notification.create({
            data: {
              tenantId: tenant.id,
              userId: owner.id,
              message: daysLeft === 1
                ? 'Your trial expires tomorrow. Upgrade now to avoid interruption.'
                : `Your trial expires in ${daysLeft} days. Upgrade now to avoid interruption.`,
              notificationType: 'TRIAL_WARNING',
            },
          });
        }

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

  // ── Retry handlers for critical failures ───────────────────────────────────

  'activate-subscription-retry': async (data) => {
    const { tenantId, planId, billingCycle, attempt } = data;
    logger.info({ tenantId, attempt }, 'Retrying subscription activation');
    const { default: subscriptionService } = await import('../modules/subscriptions/subscription.service.js');
    await prisma.$transaction(async (tx) => {
      await subscriptionService.createSubscription(tenantId, planId, billingCycle, tx);
    });
    logger.info({ tenantId }, 'Subscription activation retry succeeded');
  },

  'create-transaction-record-retry': async (data) => {
    const { paymentId, tenantId, userId, amount, currency, razorpayOrderId, receipt, notes, attempt } = data;
    logger.info({ paymentId, attempt }, 'Retrying transaction record creation');
    await prisma.transaction.create({
      data: {
        tenantId,
        userId,
        amount,
        currency,
        razorpayOrderId,
        receipt,
        status: 'CREATED',
        gatewayResponse: notes,
      },
    });
    logger.info({ paymentId }, 'Transaction record creation retry succeeded');
  },

  'retry-refund-events': async (data) => {
    const { invoiceId, tenantId, attempt } = data;
    logger.info({ invoiceId, attempt }, 'Retrying refund events');
    const { emitEvent } = await import('../shared/events/erp-event-bus.js');
    const { DOMAIN_EVENTS } = await import('../shared/constants/events.js');
    await emitEvent(DOMAIN_EVENTS.REFUND_PROCESSED, { invoiceId, tenantId });
    logger.info({ invoiceId }, 'Refund events retry succeeded');
  },

  'retry-supplier-payment-events': async (data) => {
    const { paymentId, tenantId, attempt } = data;
    logger.info({ paymentId, attempt }, 'Retrying supplier payment events');
    const { emitEvent } = await import('../shared/events/erp-event-bus.js');
    const { DOMAIN_EVENTS } = await import('../shared/constants/events.js');
    await emitEvent(DOMAIN_EVENTS.SUPPLIER_PAYMENT_MADE, { paymentId, tenantId });
    logger.info({ paymentId }, 'Supplier payment events retry succeeded');
  },

  'retry-po-approved-events': async (data) => {
    const { orderId, tenantId, attempt } = data;
    logger.info({ orderId, attempt }, 'Retrying PO approved events');
    const { emitEvent } = await import('../shared/events/erp-event-bus.js');
    const { DOMAIN_EVENTS } = await import('../shared/constants/events.js');
    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED, { orderId, tenantId });
    logger.info({ orderId }, 'PO approved events retry succeeded');
  },

  'retry-po-received-events': async (data) => {
    const { orderId, tenantId, attempt } = data;
    logger.info({ orderId, attempt }, 'Retrying PO received events');
    const { emitEvent } = await import('../shared/events/erp-event-bus.js');
    const { DOMAIN_EVENTS } = await import('../shared/constants/events.js');
    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, { orderId, tenantId });
    await emitEvent(DOMAIN_EVENTS.STOCK_UPDATED, { tenantId });
    logger.info({ orderId }, 'PO received events retry succeeded');
  },

  'cleanup-expired-payment-sessions': async () => {
    const { default: paymentSessionCleanupWorker } = await import(
      '../modules/payments/workers/payment-session-cleanup.worker.js'
    );
    await paymentSessionCleanupWorker.handle();
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
