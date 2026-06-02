import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { mainQueue } from '../../../queue/index.js';
import catalogService from './catalog.service.js';

class InventorySyncService {
  async triggerSync(tenantId, medicineId, source = 'ERP_EVENT') {
    logger.info(`[InventorySync] Triggering sync for medicine ${medicineId} (Source: ${source})`);

    const log = await prisma.inventorySyncLog.create({
      data: {
        tenantId,
        medicineId,
        sourceSystem: source,
        syncStatus: 'PENDING',
      },
    });

    await mainQueue.add('sync-inventory-storefront', {
      logId: log.id,
      tenantId,
      medicineId,
    });

    await catalogService.invalidateCatalogCache(tenantId);
  }

  async performSync(logId, tenantId, medicineId) {
    try {
      logger.info(`[InventorySync] Performing external sync for log ${logId}`);

      const medicine = await prisma.medicine.findUnique({
        where: { id: medicineId },
        include: {
          inventoryBatches: {
            where: { status: 'ACTIVE', deletedAt: null },
          },
        },
      });

      if (!medicine) throw new Error('Medicine not found');

      const totalAvailable = medicine.inventoryBatches.reduce(
        (acc, b) => acc + (b.quantity - b.reservedQuantity),
        0,
      );

      logger.info(`[MOCK] External API Call: Updating ${medicine.name} stock to ${totalAvailable}`);

      await prisma.inventorySyncLog.update({
        where: { id: logId },
        data: {
          syncStatus: 'SYNCED',
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error(`[InventorySync] Sync failed for log ${logId}: ${error.message}`);
      await prisma.inventorySyncLog.update({
        where: { id: logId },
        data: {
          syncStatus: 'FAILED',
          errorMessage: error.message,
        },
      });
    }
  }

  /**
   * Full reconciliation job to fix any drift.
   */
  async reconcileFullInventory(tenantId) {
    logger.info(`[InventorySync] Starting full reconciliation for tenant ${tenantId}`);

    const medicines = await prisma.medicine.findMany({
      where: { tenantId, isPublished: true, deletedAt: null },
      select: { id: true },
    });

    for (const med of medicines) {
      await this.triggerSync(tenantId, med.id, 'RECONCILIATION');
    }
  }
}

export default new InventorySyncService();
