import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

class UnifiedInventorySummaryService {
  async getUnifiedSummary(tenantId, branchId = null, forceRefresh = false) {
    const cacheKey = `inventory:unified:${tenantId}:${branchId || 'all'}:summary`;
    
    if (!forceRefresh) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.error({ err }, '[UNIFIED_INVENTORY] Redis cache error');
      }
    }

    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`ib."branchId" = ${bId}` : Prisma.sql`1=1`;
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [summary] = await prisma.$queryRaw`
      WITH batch_aggregates AS (
        SELECT 
          ib."medicineId",
          SUM(ib."quantity") as total_quantity,
          SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as total_value,
          COUNT(*) FILTER (WHERE ib."quantity" > 0 AND (ib."expiryDate" < ${now} OR ib."status" = 'EXPIRED')) as expired_batches,
          COUNT(*) FILTER (WHERE ib."quantity" > 0 AND ib."expiryDate" >= ${now} AND ib."expiryDate" <= ${thirtyDaysLater} AND ib."status" != 'EXPIRED') as expiring_batches,
          MAX(ib."reorderPoint") as max_reorder_point
        FROM "InventoryBatch" ib
        INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
        WHERE m."tenantId" = ${tenantId}
      AND m."deletedAt" IS NULL
          AND m."isActive" = true
          AND ${branchCondition}
        GROUP BY ib."medicineId"
      ),
      medicine_stats AS (
        SELECT
          COUNT(*) as total_medicines,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > 0) as medicines_with_stock,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) = 0) as out_of_stock_medicines,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > 0 
            AND COALESCE(ba.total_quantity, 0) <= COALESCE(ba.max_reorder_point, m."reorderLevel", 10)) as low_stock_medicines,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > COALESCE(ba.max_reorder_point, m."reorderLevel", 10)) as in_stock_medicines,
          COALESCE(SUM(ba.total_quantity), 0) as total_stock_units,
          COALESCE(SUM(ba.total_value), 0) as inventory_value,
          COALESCE(SUM(ba.expired_batches), 0) as expired_batches_count,
          COALESCE(SUM(ba.expiring_batches), 0) as expiring_batches_count,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > 0 AND ba.expired_batches > 0) as medicines_with_expired,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > 0 AND ba.expiring_batches > 0) as medicines_expiring_soon
        FROM "Medicine" m
        LEFT JOIN batch_aggregates ba ON m."id" = ba."medicineId"
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
          AND m."isActive" = true
      )
      SELECT
        total_medicines as "totalMedicines",
        total_stock_units as "totalStock",
        inventory_value as "inventoryValue",
        low_stock_medicines as "lowStockCount",
        out_of_stock_medicines as "outOfStockCount",
        expired_batches_count as "expiredBatches",
        expiring_batches_count as "expiringBatches",
        in_stock_medicines as "inStockCount",
        medicines_with_expired as "medicinesWithExpired",
        medicines_expiring_soon as "medicinesExpiringSoon",
        total_medicines as "totalProducts"
      FROM medicine_stats;
    `;

    const result = {
      totalMedicines: Number(summary?.totalMedicines || 0),
      totalStock: Number(summary?.totalStock || 0),
      inventoryValue: Number(summary?.inventoryValue || 0),
      lowStockCount: Number(summary?.lowStockCount || 0),
      outOfStockCount: Number(summary?.outOfStockCount || 0),
      expiredBatches: Number(summary?.expiredBatches || 0),
      expiringBatches: Number(summary?.expiringBatches || 0),
      inStockCount: Number(summary?.inStockCount || 0),
      medicinesWithExpired: Number(summary?.medicinesWithExpired || 0),
      medicinesExpiringSoon: Number(summary?.medicinesExpiringSoon || 0),
      totalProducts: Number(summary?.totalProducts || 0),
      // Legacy compatibility
      lowStock: Number(summary?.lowStockCount || 0),
      outOfStock: Number(summary?.outOfStockCount || 0),
      expired: Number(summary?.expiredBatches || 0),
      expiring30d: Number(summary?.expiringBatches || 0),
      inStock: Number(summary?.inStockCount || 0),
    };

    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    } catch (err) {
      logger.error({ err }, '[UNIFIED_INVENTORY] Redis cache error');
    }

    return result;
  }

  async invalidateCache(tenantId) {
    try {
      const keys = await scanKeys(`inventory:unified:${tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.error({ err }, '[UNIFIED_INVENTORY] Cache invalidation error');
    }
  }

  async getDashboardMetrics(tenantId, branchId = null) {
    const summary = await this.getUnifiedSummary(tenantId, branchId);
    
    return {
      critical: summary.outOfStockCount,
      low: summary.lowStockCount,
      outOfStock: summary.outOfStockCount,
      totalSku: summary.totalMedicines,
      lowStock: summary.lowStockCount,
      expiring30d: summary.expiringBatches,
      inventoryValue: summary.inventoryValue,
      totalStock: summary.totalStock,
      expiredCount: summary.expiredBatches,
      expiringCount: summary.expiringBatches,
      inStockCount: summary.inStockCount,
      computedAt: new Date().toISOString(),
    };
  }

  async getInventoryPageMetrics(tenantId, branchId = null) {
    const summary = await this.getUnifiedSummary(tenantId, branchId);
    
    return {
      totalMedicines: summary.totalMedicines,
      totalStock: summary.totalStock,
      inventoryValue: summary.inventoryValue,
      lowStockCount: summary.lowStockCount,
      outOfStockCount: summary.outOfStockCount,
      expired: summary.expiredBatches,
      totalProducts: summary.totalProducts,
      inStock: summary.inStockCount,
      lowStock: summary.lowStockCount,
      outOfStock: summary.outOfStockCount,
    };
  }
}

export default new UnifiedInventorySummaryService();