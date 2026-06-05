import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import inventoryService from './inventory.service.js';

class ReconciliationService {
  /**
   * Reconcile cache with DB for a tenant/branch
   */
  async reconcileAll(tenantId, branchId = null) {
    logger.info(
      `[RECONCILIATION] Starting sync for tenant ${tenantId}, branch: ${branchId || 'ALL'}`,
    );

    const medicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });

    const results = [];

    for (const medicine of medicines) {
      const dbStock = await this.getDbStock(medicine.id, branchId);
      const cacheKey = `inventory:${tenantId}:${medicine.id}:${branchId || 'central'}`;
      const cacheStock = await redisClient.get(cacheKey);

      const drift = cacheStock !== null && parseInt(cacheStock) !== dbStock;

      if (drift || cacheStock === null) {
        await inventoryService.updateCache(tenantId, medicine.id, branchId, dbStock);

        await prisma.inventoryReconciliation.create({
          data: {
            tenantId,
            medicineId: medicine.id,
            branchId,
            dbQuantity: dbStock,
            cacheQuantity: cacheStock !== null ? parseInt(cacheStock) : -1,
            reconciled: true,
          },
        });

        results.push({ medicineId: medicine.id, drift: true, dbStock, cacheStock });
      }
    }

    logger.info(`[RECONCILIATION] Completed. Found ${results.length} drifts.`);
    return results;
  }

  async getDbStock(medicineId, branchId) {
    const batchSum = await prisma.inventoryBatch.aggregate({
      where: {
        medicineId,
        branchId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      _sum: {
        quantity: true,
      },
    });
    return batchSum._sum.quantity || 0;
  }
}

export default new ReconciliationService();
