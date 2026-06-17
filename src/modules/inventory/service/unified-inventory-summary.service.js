import { Prisma } from '@prisma/client';
import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import analyticsRepository from '../../analytics/repository/analytics.repository.js';

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

    const [expiringCount, inventoryValue, trueExpiredCount, [summary]] = await Promise.all([
      analyticsRepository.getExpiring30Count(tenantId, bId),
      analyticsRepository.getInventoryValue(tenantId, bId),
      prisma.inventoryBatch.count({
        where: {
          tenantId,
          deletedAt: null,
          quantity: { gt: 0 },
          OR: [{ expiryDate: { lt: new Date() } }, { status: 'EXPIRED' }],
          status: { not: 'ARCHIVED' },
          ...(bId && { branchId: bId }),
        },
      }),
      prisma.$queryRaw`
      WITH batch_aggregates AS (
        SELECT 
          ib."medicineId",
          SUM(ib."quantity") as total_quantity,
          SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as total_value,
          COUNT(*) FILTER (WHERE ib."quantity" > 0 AND (ib."expiryDate" < NOW() OR ib."status" = 'EXPIRED')) as expired_batches,
          MAX(i."reorderPoint") as max_reorder_point
        FROM "InventoryBatch" ib
        INNER JOIN "Medicine" m
          ON ib."medicineId" = m."id"

        LEFT JOIN "Inventory" i
          ON i."medicineId" = ib."medicineId"
          AND i."branchId" = ib."branchId"
          AND i."tenantId" = m."tenantId"

        WHERE m."tenantId" = ${tenantId}
          AND ib."deletedAt" IS NULL
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
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) <= COALESCE(ba.max_reorder_point, m."reorderLevel", 0)) as low_stock_medicines,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > COALESCE(ba.max_reorder_point, m."reorderLevel", 0)) as in_stock_medicines,
          COALESCE(SUM(ba.total_quantity), 0) as total_stock_units,
          COALESCE(SUM(ba.total_value), 0) as inventory_value,
          COALESCE(SUM(ba.expired_batches), 0) as expired_batches_count,
          COUNT(*) FILTER (WHERE COALESCE(ba.total_quantity, 0) > 0 AND ba.expired_batches > 0) as medicines_with_expired
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
        in_stock_medicines as "inStockCount",
        medicines_with_expired as "medicinesWithExpired",
        total_medicines as "totalProducts"
      FROM medicine_stats;
    `,
    ]);

    const result = {
      totalMedicines: Number(summary?.totalMedicines || 0),
      totalStock: Number(summary?.totalStock || 0),
      inventoryValue: Number(inventoryValue || 0),
      lowStockCount: Number(summary?.lowStockCount || 0),
      outOfStockCount: Number(summary?.outOfStockCount || 0),
      expiredBatches: Number(trueExpiredCount || 0),
      expiringBatches: Number(expiringCount || 0),
      inStockCount: Number(summary?.inStockCount || 0),
      medicinesWithExpired: Number(summary?.medicinesWithExpired || 0),
      totalProducts: Number(summary?.totalProducts || 0),
      // Legacy compatibility
      lowStock: Number(summary?.lowStockCount || 0),
      outOfStock: Number(summary?.outOfStockCount || 0),
      expired: Number(trueExpiredCount || 0),
      expiring30d: Number(expiringCount || 0),
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

  async getExpiryMetrics(tenantId, branchId = null) {
    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`AND "branchId" = ${bId}` : Prisma.sql``;

    const [expiredCount, expiring7Count, expiring30Count, expiring90Count] = await Promise.all([
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "InventoryBatch"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND quantity > 0
          AND ("expiryDate" < NOW() OR status = 'EXPIRED')
          ${branchCondition}
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "InventoryBatch"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND quantity > 0
          AND status != 'EXPIRED'
          AND "expiryDate" >= NOW()
          AND "expiryDate" < NOW() + INTERVAL '7 days'
          ${branchCondition}
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "InventoryBatch"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND quantity > 0
          AND status != 'EXPIRED'
          AND "expiryDate" >= NOW()
          AND "expiryDate" < NOW() + INTERVAL '30 days'
          ${branchCondition}
      `,
      prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "InventoryBatch"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND quantity > 0
          AND status != 'EXPIRED'
          AND "expiryDate" >= NOW()
          AND "expiryDate" < NOW() + INTERVAL '90 days'
          ${branchCondition}
      `,
    ]);

    return {
      expired: Number(expiredCount[0]?.count || 0),
      expiring7: Number(expiring7Count[0]?.count || 0),
      expiring30: Number(expiring30Count[0]?.count || 0),
      expiring90: Number(expiring90Count[0]?.count || 0),
    };
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

  async getValueSummary(tenantId, branchId = null) {
    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`ib."branchId" = ${bId}` : Prisma.sql`1=1`;

    const data = await prisma.$queryRaw`
      SELECT 
        SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as "totalValue",
        SUM(ib."quantity" * COALESCE(ib."sellingPrice", ib."mrp", 0)) as "retailValue",
        SUM(ib."quantity" * COALESCE(ib."sellingPrice", ib."mrp", 0)) - SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as "potentialProfit"
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."quantity" > 0
        AND ${branchCondition}
    `;

    return {
      totalValue: Number(data[0]?.totalValue || 0),
      retailValue: Number(data[0]?.retailValue || 0),
      potentialProfit: Number(data[0]?.potentialProfit || 0),
    };
  }

  async getCategoryBreakdown(tenantId, branchId = null) {
    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`ib."branchId" = ${bId}` : Prisma.sql`1=1`;

    const data = await prisma.$queryRaw`
      SELECT 
        c."name" as category,
        SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as value,
        SUM(ib."quantity") as quantity
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      LEFT JOIN "MedicineCategory" c ON m."categoryId" = c."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."quantity" > 0
        AND ${branchCondition}
      GROUP BY c."name"
      ORDER BY value DESC
    `;

    return data.map((d) => ({
      category: d.category || 'Uncategorized',
      value: Number(d.value || 0),
      quantity: Number(d.quantity || 0),
    }));
  }

  async getHighValueStock(tenantId, branchId = null) {
    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`ib."branchId" = ${bId}` : Prisma.sql`1=1`;

    const data = await prisma.$queryRaw`
      SELECT 
        m."name",
        m."genericName",
        SUM(ib."quantity") as quantity,
        SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as "totalValue"
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."quantity" > 0
        AND ${branchCondition}
      GROUP BY m."id", m."name", m."genericName"
      ORDER BY "totalValue" DESC
      LIMIT 10
    `;

    return data.map((d) => ({
      name: d.name,
      genericName: d.genericName,
      quantity: Number(d.quantity || 0),
      totalValue: Number(d.totalValue || 0),
    }));
  }

  async getExpiryRisk(tenantId, branchId = null) {
    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? Prisma.sql`ib."branchId" = ${bId}` : Prisma.sql`1=1`;

    const data = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN ib."expiryDate" < NOW() THEN 'expired'
          WHEN ib."expiryDate" < NOW() + INTERVAL '30 days' THEN 'risk30'
          WHEN ib."expiryDate" < NOW() + INTERVAL '90 days' THEN 'risk90'
          ELSE 'safe'
        END as risk_category,
        SUM(ib."quantity" * COALESCE(ib."purchasePrice", 0)) as value,
        COUNT(ib."id") as count
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."quantity" > 0
        AND ${branchCondition}
      GROUP BY risk_category
    `;

    const result = {
      expired: { value: 0, count: 0 },
      risk30: { value: 0, count: 0 },
      risk90: { value: 0, count: 0 },
      safe: { value: 0, count: 0 },
    };

    data.forEach((d) => {
      if (result[d.risk_category]) {
        result[d.risk_category].value = Number(d.value || 0);
        result[d.risk_category].count = Number(d.count || 0);
      }
    });

    return result;
  }
}

export default new UnifiedInventorySummaryService();
