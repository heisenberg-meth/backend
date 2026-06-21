import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import unifiedInventorySummaryService from './unified-inventory-summary.service.js';

class DisposeService {
  async disposeBatches(tenantId, userId, batchIds, reason, notes) {
    if (!batchIds || !batchIds.length) {
      throw new Error('No batches selected for disposal');
    }

    // Fetch all requested batches, scoped to tenant
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        id: { in: batchIds },
        tenantId,
        deletedAt: null,
      },
      include: { medicine: { select: { id: true, name: true } } },
    });

    if (batches.length !== batchIds.length) {
      throw new Error('Some batches could not be found or do not belong to this tenant');
    }

    // Validate each batch
    for (const batch of batches) {
      if (batch.availableQuantity <= 0) {
        throw new Error(`Batch ${batch.batchNumber} has no available quantity to dispose`);
      }
      if (batch.status !== 'EXPIRED') {
        throw new Error(
          `Batch ${batch.batchNumber} has status "${batch.status}" — only EXPIRED batches can be disposed`,
        );
      }
    }

    // Compute summary totals for response
    let disposedUnits = 0;
    let inventoryLoss = 0;

    const disposalRecords = batches.map((batch) => {
      const qty = batch.availableQuantity;
      const purchasePrice = parseFloat(batch.purchasePrice || 0);
      disposedUnits += qty;
      inventoryLoss += qty * purchasePrice;

      return {
        tenantId,
        branchId: batch.branchId || null,
        medicineId: batch.medicineId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        disposedQuantity: qty,
        purchasePrice,
        mrp: parseFloat(batch.mrp || 0),
        reason: reason || 'EXPIRED',
        notes: notes || '',
        disposedBy: userId,
      };
    });

    // Transactional update: EXPIRED → ARCHIVED, availableQuantity → 0, write disposal records
    await prisma.$transaction([
      prisma.inventoryBatch.updateMany({
        where: {
          id: { in: batchIds },
          tenantId,
        },
        data: {
          status: 'ARCHIVED',
          availableQuantity: 0,
          updatedAt: new Date(),
        },
      }),
      prisma.inventoryDisposal.createMany({
        data: disposalRecords,
      }),
    ]);

    // Broad cache invalidation across all relevant namespaces
    await this._invalidateCaches(tenantId);

    return {
      success: true,
      disposedBatches: batches.length,
      disposedUnits,
      inventoryLoss,
    };
  }

  async getDisposalHistory(tenantId, filters = {}) {
    const where = { tenantId };

    if (filters.startDate && filters.endDate) {
      where.disposedAt = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }

    const limit = Math.min(parseInt(filters.limit) || 100, 500);
    const skip = parseInt(filters.skip) || 0;

    const [items, total] = await Promise.all([
      prisma.inventoryDisposal.findMany({
        where,
        include: {
          medicine: { select: { name: true, genericName: true } },
          batch: { select: { batchNumber: true } },
          user: { select: { firstName: true, lastName: true, fullName: true, email: true } },
        },
        orderBy: { disposedAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.inventoryDisposal.count({ where }),
    ]);

    return { items, total };
  }

  async _invalidateCaches(tenantId) {
    try {
      // Use unified inventory service invalidation first
      await unifiedInventorySummaryService.invalidateCache(tenantId);

      // Also wipe other cache namespaces referenced in the PRD
      const patterns = [
        `inventory:summary:${tenantId}:*`,
        `expiry:metrics:${tenantId}:*`,
        `dashboard:${tenantId}:*`,
        `analytics:${tenantId}:*`,
      ];

      const keySets = await Promise.all(patterns.map((p) => scanKeys(p)));
      const allKeys = keySets.flat();

      if (allKeys.length > 0) {
        await redisClient.del(...allKeys);
      }
    } catch (err) {
      // Non-fatal — log and continue
      console.error('[DISPOSE] Cache invalidation error:', err.message);
    }
  }
}

export default new DisposeService();
