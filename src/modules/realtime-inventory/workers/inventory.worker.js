import { Queue, Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import reconciliationService from '../services/reconciliation.service.js';
import dashboardService from '../services/dashboard.service.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';
import { registerQueue, registerWorker } from '../../../config/queue-registry.js';

const INVENTORY_QUEUE = 'inventory-tasks';

export let inventoryQueue = null;
export let inventoryWorker = null;

export const createInventoryQueue = () => {
  if (!inventoryQueue) {
    inventoryQueue = registerQueue(new Queue(INVENTORY_QUEUE, {
      connection: getBullRedis()
    }));
  }
  return inventoryQueue;
};

export const createInventoryWorker = () => {
  if (!inventoryWorker) {
    inventoryWorker = registerWorker(new Worker(INVENTORY_QUEUE, async (job) => {
      const { type, tenantId, branchId } = job.data;

      try {
        switch (type) {
          case 'RECONCILE':
            await reconciliationService.reconcileAll(tenantId, branchId);
            break;

          case 'REFRESH_DASHBOARD':
            await dashboardService.refreshDashboardCache(tenantId, branchId);
            break;

          case 'GLOBAL_RECONCILE': {
            const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
            for (const tenant of tenants) {
              await reconciliationService.reconcileAll(tenant.id);
            }
            break;
          }

          default:
            logger.warn(`[INVENTORY_WORKER] Unknown job type: ${type}`);
        }
      } catch (error) {
        logger.error({ error, job: job.id }, '[INVENTORY_WORKER] Job failed');
        throw error;
      }
    }, {
      connection: getBullRedis()
    }));
  }
  return inventoryWorker;
};

export const initInventoryWorker = () => {
  if (!inventoryQueue) return;
  inventoryQueue.add('global-reconcile', { type: 'GLOBAL_RECONCILE' }, {
    repeat: { pattern: '0 0 * * *' }
  });
  logger.info('[INVENTORY_WORKER] Periodic jobs scheduled');
};
