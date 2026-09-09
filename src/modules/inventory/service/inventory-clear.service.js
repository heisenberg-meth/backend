import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import cacheInvalidatorService from './cache-invalidator.service.js';
import { acquireLock, releaseLock } from '../../../shared/utils/lock.js';
import { mainQueue } from '../../../queue/index.js';

class InventoryClearService {
  /**
   * Builds the Prisma filter for active inventory belonging to a tenant and branch.
   */
  _buildActiveInventoryWhere(tenantId, branchId) {
    const where = {
      tenantId,
      deletedAt: null,
      isArchived: false,
      OR: [
        { status: { not: 'ARCHIVED' } },
        { quantity: { gt: 0 } },
        { availableQuantity: { gt: 0 } },
      ],
    };

    if (branchId && branchId !== 'all' && branchId !== 'null' && branchId !== 'undefined') {
      where.branchId = branchId;
    }

    return where;
  }

  /**
   * Retrieves summary of active inventory that would be affected by a clear operation.
   *
   * @param {string} tenantId
   * @param {string|null} branchId
   * @returns {Promise<{ batchCount: number, totalUnits: number, branchName: string|null }>}
   */
  async getClearSummary(tenantId, branchId = null) {
    const where = this._buildActiveInventoryWhere(tenantId, branchId);

    const [aggregate, branch] = await Promise.all([
      prisma.inventoryBatch.aggregate({
        where,
        _count: { id: true },
        _sum: { availableQuantity: true, quantity: true },
      }),
      branchId && branchId !== 'all'
        ? prisma.branch.findFirst({
            where: { id: branchId, tenantId },
            select: { name: true },
          })
        : null,
    ]);

    const batchCount = aggregate._count?.id || 0;
    const totalUnits =
      (aggregate._sum?.availableQuantity ?? 0) > 0
        ? aggregate._sum.availableQuantity
        : (aggregate._sum?.quantity ?? 0);

    return {
      batchCount,
      totalUnits,
      branchName: branch?.name || null,
    };
  }

  /**
   * Atomically clears active inventory for the authenticated tenant and branch.
   * Sets quantities to 0, marks batches as ARCHIVED with isArchived = true,
   * creates audit records and stock movement history, and invalidates caches.
   *
   * @param {string} tenantId
   * @param {string|null} branchId
   * @param {string} userId
   * @returns {Promise<{ success: boolean, message: string, summary: { batchesCleared: number, unitsCleared: number } }>}
   */
  async clearBranchInventory(tenantId, branchId = null, userId = null) {
    const lockResource = `inventory-op:${tenantId}:${branchId || 'default'}`;
    const locked = await acquireLock(lockResource, 30000);

    if (!locked) {
      const err = new Error(
        'An inventory operation or import is already in progress. Please wait.',
      );
      err.statusCode = 409;
      err.errorCode = 'OPERATION_IN_PROGRESS';
      throw err;
    }

    try {
      const where = this._buildActiveInventoryWhere(tenantId, branchId);

      const activeBatches = await prisma.inventoryBatch.findMany({
        where,
        select: {
          id: true,
          medicineId: true,
          batchNumber: true,
          quantity: true,
          availableQuantity: true,
          reservedQuantity: true,
          status: true,
        },
      });

      if (activeBatches.length === 0) {
        return {
          success: true,
          message: 'No active inventory to clear',
          summary: {
            batchesCleared: 0,
            unitsCleared: 0,
          },
        };
      }

      const totalBatches = activeBatches.length;
      const totalUnits = activeBatches.reduce(
        (sum, b) => sum + (b.availableQuantity > 0 ? b.availableQuantity : b.quantity || 0),
        0,
      );
      const affectedMedicineIds = [...new Set(activeBatches.map((b) => b.medicineId))];
      const now = new Date();

      // Execute inside atomic database transaction
      await prisma.$transaction(async (tx) => {
        const CHUNK_SIZE = 500;
        for (let i = 0; i < activeBatches.length; i += CHUNK_SIZE) {
          const chunk = activeBatches.slice(i, i + CHUNK_SIZE);
          const chunkIds = chunk.map((b) => b.id);

          // 1. Bulk update batches
          await tx.inventoryBatch.updateMany({
            where: {
              id: { in: chunkIds },
              tenantId,
            },
            data: {
              quantity: 0,
              availableQuantity: 0,
              reservedQuantity: 0,
              status: 'ARCHIVED',
              isArchived: true,
              archivedAt: now,
              archivedBy: userId,
              archiveReason: 'CLEAR_INVENTORY',
            },
          });

          // 2. Batch audit logs
          const batchAuditEntries = chunk.map((b) => ({
            tenantId,
            batchId: b.id,
            actionType: 'CLEAR_INVENTORY',
            beforeState: {
              quantity: b.quantity,
              availableQuantity: b.availableQuantity,
              reservedQuantity: b.reservedQuantity,
              status: b.status,
            },
            afterState: {
              quantity: 0,
              availableQuantity: 0,
              reservedQuantity: 0,
              status: 'ARCHIVED',
              isArchived: true,
            },
            performedBy: userId,
            reason: 'Branch inventory cleared by user',
            performedAt: now,
          }));

          await tx.batchAuditLog.createMany({
            data: batchAuditEntries,
          });

          // 3. Stock movement history records
          const stockMovements = chunk
            .filter((b) => (b.availableQuantity || b.quantity || 0) > 0)
            .map((b) => {
              const prevQty = b.availableQuantity > 0 ? b.availableQuantity : b.quantity;
              return {
                tenantId,
                branchId: branchId || null,
                medicineId: b.medicineId,
                batchId: b.id,
                movementType: 'DISPOSAL',
                quantity: prevQty,
                quantityBefore: prevQty,
                quantityAfter: 0,
                referenceType: 'INVENTORY_CLEAR',
                performedBy: userId,
                notes: 'Active inventory cleared via destructive reset',
                createdAt: now,
              };
            });

          if (stockMovements.length > 0) {
            await tx.stockMovement.createMany({
              data: stockMovements,
            });
          }
        }
      });

      // 4. Audit Log (asynchronous fallback handled inside service)
      try {
        await auditService.log({
          tenantId,
          userId,
          action: 'CLEAR_INVENTORY',
          target: `${totalBatches} batches (${totalUnits} units) cleared for branch ${branchId || 'default'}`,
          type: 'INVENTORY',
        });
      } catch (auditErr) {
        logger.error({ err: auditErr }, 'Failed to record system audit for CLEAR_INVENTORY');
      }

      // 5. Invalidate all relevant caches
      try {
        await cacheInvalidatorService.invalidateInventoryCaches(tenantId, affectedMedicineIds);
      } catch (cacheErr) {
        logger.warn({ err: cacheErr }, 'Cache invalidation failed after inventory clear');
      }

      // 6. Queue background analytics refresh
      try {
        if (mainQueue) {
          await mainQueue.add('update-analytics', { tenantId });
        }
      } catch {
        // queue error non-blocking
      }

      logger.info(
        { tenantId, branchId, userId, totalBatches, totalUnits },
        'Inventory cleared successfully',
      );

      return {
        success: true,
        message: 'Inventory cleared successfully',
        summary: {
          batchesCleared: totalBatches,
          unitsCleared: totalUnits,
        },
      };
    } finally {
      await releaseLock(lockResource);
    }
  }
}

export default new InventoryClearService();
