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
        logger.warn({ err }, '[UNIFIED_INVENTORY] Redis cache error');
      }
    }

    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    // Use CURRENT_DATE (date-only) everywhere to avoid UTC/IST timezone mismatch.
    // A medicine is expired when expiryDate::date < CURRENT_DATE.
    // expiryDate = today means "expires today" = NOT yet expired.
    const [expiryMetrics, [summary]] = await Promise.all([
      this.getExpiryMetrics(tenantId, bId),
      prisma.$queryRaw`
      WITH batch_aggregates AS (
        SELECT 
          ib."medicineId",
          SUM(ib."availableQuantity") as total_quantity,
          SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as total_value,
          COUNT(*) FILTER (WHERE ib."availableQuantity" > 0 AND (ib."expiryDate"::date < CURRENT_DATE OR ib."status" = 'EXPIRED')) as expired_batches,
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
          AND ib."isArchived" = false
          ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
        GROUP BY ib."medicineId"
      ),
      medicine_stats AS (
        SELECT
          COUNT(*) as total_medicines,
          COUNT(*) FILTER (WHERE m."isActive" = true AND COALESCE(ba.total_quantity, 0) > 0) as medicines_with_stock,
          COUNT(*) FILTER (WHERE m."isActive" = true AND COALESCE(ba.total_quantity, 0) = 0) as out_of_stock_medicines,
          COUNT(*) FILTER (
            WHERE m."isActive" = true
              AND COALESCE(ba.total_quantity, 0) > 0
              AND COALESCE(ba.total_quantity, 0) <= COALESCE(ba.max_reorder_point, m."reorderLevel", 10)
          ) as low_stock_medicines,
          COUNT(*) FILTER (
            WHERE m."isActive" = true
              AND COALESCE(ba.total_quantity, 0) > COALESCE(ba.max_reorder_point, m."reorderLevel", 10)
          ) as in_stock_medicines,
          COALESCE(SUM(ba.total_quantity), 0) as total_stock_units,
          COALESCE(SUM(ba.total_value), 0) as inventory_value,
          COALESCE(SUM(ba.expired_batches), 0) as expired_batches_count,
          COUNT(*) FILTER (WHERE m."isActive" = true AND COALESCE(ba.total_quantity, 0) > 0 AND ba.expired_batches > 0) as medicines_with_expired
        FROM "Medicine" m
        LEFT JOIN batch_aggregates ba ON m."id" = ba."medicineId"
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
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
      inventoryValue: Number(summary?.inventoryValue || 0),
      lowStockCount: Number(summary?.lowStockCount || 0),
      outOfStockCount: Number(summary?.outOfStockCount || 0),
      expiredBatches: Number(expiryMetrics?.expiredBatches || 0),
      expiringBatches: Number(expiryMetrics?.expiring30 || 0),
      inStockCount: Number(summary?.inStockCount || 0),
      medicinesWithExpired: Number(summary?.medicinesWithExpired || 0),
      totalProducts: Number(summary?.totalProducts || 0),
      // Legacy compatibility
      lowStock: Number(summary?.lowStockCount || 0),
      outOfStock: Number(summary?.outOfStockCount || 0),
      expired: Number(expiryMetrics?.expiredBatches || 0),
      expiring30d: Number(expiryMetrics?.expiring30 || 0),
      inStock: Number(summary?.inStockCount || 0),
    };

    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    } catch (err) {
      logger.warn({ err }, '[UNIFIED_INVENTORY] Redis cache error');
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
      logger.warn({ err }, '[UNIFIED_INVENTORY] Cache invalidation error');
    }
  }

  async getExpiryMetrics(tenantId, branchId = null) {
    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    // Single query to get all expiry metrics consistently.
    // Uses CURRENT_DATE (date-only) to avoid UTC/IST timezone bugs.
    // Counts both batches and distinct products for each category.
    // Uses availableQuantity (remaining stock) not quantity (original stock).
    const [metrics] = await prisma.$queryRaw`
      SELECT
        -- Expired: expiryDate < TODAY AND availableQuantity > 0
        COUNT(*) FILTER (
          WHERE (ib."expiryDate"::date < CURRENT_DATE OR ib.status = 'EXPIRED')
            AND ib."availableQuantity" > 0
        )::int as "expiredBatches",
        
        COUNT(DISTINCT ib."medicineId") FILTER (
          WHERE (ib."expiryDate"::date < CURRENT_DATE OR ib.status = 'EXPIRED')
            AND ib."availableQuantity" > 0
        )::int as "expiredProducts",
        
        COALESCE(SUM(ib."availableQuantity") FILTER (
          WHERE (ib."expiryDate"::date < CURRENT_DATE OR ib.status = 'EXPIRED')
            AND ib."availableQuantity" > 0
        ), 0)::int as "expiredUnits",
        
        COALESCE(SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) FILTER (
          WHERE (ib."expiryDate"::date < CURRENT_DATE OR ib.status = 'EXPIRED')
            AND ib."availableQuantity" > 0
        ), 0)::numeric as "expiredValue",

        -- Expiring 7 Days: TODAY <= expiryDate <= TODAY+7
        COUNT(*) FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date >= CURRENT_DATE
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '7 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring7Batches",
        
        COUNT(DISTINCT ib."medicineId") FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date >= CURRENT_DATE
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '7 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring7Products",

        -- Expiring 30 Days: TODAY+8 <= expiryDate <= TODAY+30
        COUNT(*) FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date > CURRENT_DATE + INTERVAL '7 days'
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '30 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring30Batches",
        
        COUNT(DISTINCT ib."medicineId") FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date > CURRENT_DATE + INTERVAL '7 days'
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '30 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring30Products",

        -- Expiring 90 Days: TODAY+31 <= expiryDate <= TODAY+90
        COUNT(*) FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date > CURRENT_DATE + INTERVAL '30 days'
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '90 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring90Batches",
        
        COUNT(DISTINCT ib."medicineId") FILTER (
          WHERE ib.status != 'EXPIRED'
            AND ib."expiryDate"::date > CURRENT_DATE + INTERVAL '30 days'
            AND ib."expiryDate"::date <= CURRENT_DATE + INTERVAL '90 days'
            AND ib."availableQuantity" > 0
        )::int as "expiring90Products",

        -- Total inventory
        COUNT(*)::int as "totalBatches",
        COUNT(DISTINCT ib."medicineId")::int as "totalProducts",
        COALESCE(SUM(ib."availableQuantity"), 0)::int as "totalUnits"

      FROM "InventoryBatch" ib
      WHERE ib."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND ib."availableQuantity" > 0
        AND ib.status != 'ARCHIVED'
        AND ib."isArchived" = false
        ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
    `;

    const expiring30CombinedBatches =
      Number(metrics?.expiring7Batches || 0) + Number(metrics?.expiring30Batches || 0);
    const expiring30CombinedProducts =
      Number(metrics?.expiring7Products || 0) + Number(metrics?.expiring30Products || 0);

    return {
      // Legacy fields (batch counts)
      expired: Number(metrics?.expiredBatches || 0),
      expiring7: Number(metrics?.expiring7Batches || 0),
      expiring30: expiring30CombinedBatches,
      expiring90: Number(metrics?.expiring90Batches || 0),
      // New detailed fields
      expiredProducts: Number(metrics?.expiredProducts || 0),
      expiring7Products: Number(metrics?.expiring7Products || 0),
      expiring30Products: expiring30CombinedProducts,
      expiring90Products: Number(metrics?.expiring90Products || 0),

      expiredBatches: Number(metrics?.expiredBatches || 0),
      expiring7Batches: Number(metrics?.expiring7Batches || 0),
      expiring30Batches: Number(metrics?.expiring30Batches || 0),
      expiring30CombinedBatches: expiring30CombinedBatches,
      expiring90Batches: Number(metrics?.expiring90Batches || 0),

      expiredUnits: Number(metrics?.expiredUnits || 0),
      expiredValue: Number(metrics?.expiredValue || 0),

      totalBatches: Number(metrics?.totalBatches || 0),
      totalProducts: Number(metrics?.totalProducts || 0),
      totalUnits: Number(metrics?.totalUnits || 0),
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
    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    const data = await prisma.$queryRaw`
      SELECT 
        SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as "totalValue",
        SUM(ib."availableQuantity" * COALESCE(ib."sellingPrice", ib."mrp", 0)) as "retailValue",
        SUM(ib."availableQuantity" * COALESCE(ib."sellingPrice", ib."mrp", 0)) - SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as "potentialProfit"
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."availableQuantity" > 0
        AND ib."isArchived" = false
        ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
    `;

    return {
      totalValue: Number(data[0]?.totalValue || 0),
      retailValue: Number(data[0]?.retailValue || 0),
      potentialProfit: Number(data[0]?.potentialProfit || 0),
    };
  }

  async getCategoryBreakdown(tenantId, branchId = null) {
    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    const data = await prisma.$queryRaw`
      SELECT 
        c."name" as category,
        SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as value,
        SUM(ib."availableQuantity") as quantity
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      LEFT JOIN "MedicineCategory" c ON m."categoryId" = c."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."availableQuantity" > 0
        AND ib."isArchived" = false
        ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
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
    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    const data = await prisma.$queryRaw`
      SELECT 
        m."name",
        m."genericName",
        SUM(ib."availableQuantity") as quantity,
        SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as "totalValue"
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."availableQuantity" > 0
        AND ib."isArchived" = false
        ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
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
    const bId = branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    const data = await prisma.$queryRaw`
      SELECT 
        CASE 
          WHEN ib."expiryDate"::date < CURRENT_DATE THEN 'expired'
          WHEN ib."expiryDate"::date < CURRENT_DATE + INTERVAL '30 days' THEN 'risk30'
          WHEN ib."expiryDate"::date < CURRENT_DATE + INTERVAL '90 days' THEN 'risk90'
          ELSE 'safe'
        END as risk_category,
        SUM(ib."availableQuantity" * COALESCE(ib."purchasePrice", 0)) as value,
        COUNT(ib."id") as count
      FROM "InventoryBatch" ib
      INNER JOIN "Medicine" m ON ib."medicineId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND ib."deletedAt" IS NULL
        AND m."deletedAt" IS NULL
        AND m."isActive" = true
        AND ib."availableQuantity" > 0
        AND ib."isArchived" = false
        ${bId ? Prisma.sql`AND ib."branchId" = ${bId}` : Prisma.empty}
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
