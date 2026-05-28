import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';
import behaviorService from '../services/behavior.service.js';
import segmentationService from '../services/segmentation.service.js';
import reminderService from '../services/reminder.service.js';
import subscriptionService from '../services/subscription.service.js';
import { registerWorker } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'segmentation-analysis': async () => {
    logger.info('[CRM Worker] Starting tenant-wide segmentation analysis');
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const tenant of tenants) {
      await behaviorService.runTenantAnalysis(tenant.id);
      await segmentationService.updateSegments(tenant.id);
    }
  },
  'process-reminders': async () => {
    await reminderService.processDueReminders();
  },
  'process-subscriptions': async () => {
    await subscriptionService.processDueSubscriptions();
  },
};

export const crmWorker = isTest
  ? null
  : registerWorker(
      new Worker(
        'viyan-medassist-crm',
        async (job) => {
          const handler = handlers[job.name];
          if (handler) {
            logger.info(`[CRM Worker] Started job ${job.id} (${job.name})`);
            await handler(job.data);
            logger.info(`[CRM Worker] Finished job ${job.id} (${job.name})`);
          } else {
            logger.warn(`[CRM Worker] No handler for job type: ${job.name}`);
          }
        },
        {
          connection: getBullRedis(),
          concurrency: 2,
        },
      ),
    );

if (crmWorker) {
  crmWorker.on('failed', (job, err) => {
    logger.error(`[CRM Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
