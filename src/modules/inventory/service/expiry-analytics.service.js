/**
 * ExpiryAnalyticsService - Single Source of Truth
 *
 * All expiry calculations MUST go through this service.
 * No module may calculate expiry independently.
 *
 * Dashboard, Expiry Page, Reports, Supplier Returns, Bulk Disposal
 * all consume from this service only.
 */

import prisma from '../../../config/prisma.js';
import cache from '../../../shared/services/cache.service.js';

const CACHE_TTL = 120; // 2 minutes

class ExpiryAnalyticsService {
  /**
   * Get complete expiry metrics for a tenant
   * This is THE source of truth for all expiry counts
   *
   * @param {string} tenantId
   * @param {string|null} branchId - optional branch filter
   * @returns {Object} Expiry metrics
   */
  async getExpiryMetrics(tenantId, branchId = null) {
    const cacheKey = `expiry:metrics:${tenantId}:${branchId || 'all'}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId ? prisma.$queryRaw`AND "branchId" = ${bId}` : prisma.$queryRaw``;

    // Single atomic query - all metrics from one source
    const [metrics] = await prisma.$queryRaw`
      SELECT
        -- Expired: expiryDate < TODAY AND availableQuantity > 0
        COUNT(*) FILTER (
          WHERE "expiryDate"::date < CURRENT_DATE
            AND "availableQuantity" > 0
        )::int as "expiredBatches",
        
        COUNT(DISTINCT "medicineId") FILTER (
          WHERE "expiryDate"::date < CURRENT_DATE
            AND "availableQuantity" > 0
        )::int as "expiredProducts",
        
        COALESCE(SUM("availableQuantity") FILTER (
          WHERE "expiryDate"::date < CURRENT_DATE
            AND "availableQuantity" > 0
        ), 0)::int as "expiredUnits",
        
        COALESCE(SUM("availableQuantity" * COALESCE("purchasePrice", 0)) FILTER (
          WHERE "expiryDate"::date < CURRENT_DATE
            AND "availableQuantity" > 0
        ), 0)::numeric as "expiredValue",

        -- Expiring 7 Days: TODAY <= expiryDate <= TODAY+7
        COUNT(*) FILTER (
          WHERE "expiryDate"::date >= CURRENT_DATE
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '7 days'
            AND "availableQuantity" > 0
        )::int as "expiring7Batches",
        
        COUNT(DISTINCT "medicineId") FILTER (
          WHERE "expiryDate"::date >= CURRENT_DATE
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '7 days'
            AND "availableQuantity" > 0
        )::int as "expiring7Products",

        -- Expiring 30 Days: TODAY+8 <= expiryDate <= TODAY+30
        COUNT(*) FILTER (
          WHERE "expiryDate"::date > CURRENT_DATE + INTERVAL '7 days'
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '30 days'
            AND "availableQuantity" > 0
        )::int as "expiring30Batches",
        
        COUNT(DISTINCT "medicineId") FILTER (
          WHERE "expiryDate"::date > CURRENT_DATE + INTERVAL '7 days'
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '30 days'
            AND "availableQuantity" > 0
        )::int as "expiring30Products",

        -- Expiring 90 Days: TODAY+31 <= expiryDate <= TODAY+90
        COUNT(*) FILTER (
          WHERE "expiryDate"::date > CURRENT_DATE + INTERVAL '30 days'
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '90 days'
            AND "availableQuantity" > 0
        )::int as "expiring90Batches",
        
        COUNT(DISTINCT "medicineId") FILTER (
          WHERE "expiryDate"::date > CURRENT_DATE + INTERVAL '30 days'
            AND "expiryDate"::date <= CURRENT_DATE + INTERVAL '90 days'
            AND "availableQuantity" > 0
        )::int as "expiring90Products",

        -- Total inventory
        COUNT(*)::int as "totalBatches",
        COUNT(DISTINCT "medicineId")::int as "totalProducts",
        COALESCE(SUM("availableQuantity"), 0)::int as "totalUnits"

      FROM "InventoryBatch"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "availableQuantity" > 0
        AND status != 'ARCHIVED'
        ${branchCondition}
    `;

    // Combined expiring 30D = expiring7 + expiring30 (for backward compatibility)
    const expiring30CombinedBatches =
      Number(metrics?.expiring7Batches || 0) + Number(metrics?.expiring30Batches || 0);
    const expiring30CombinedProducts =
      Number(metrics?.expiring7Products || 0) + Number(metrics?.expiring30Products || 0);

    const result = {
      // Dashboard metrics (product-based)
      expiredProducts: Number(metrics?.expiredProducts || 0),
      expiring7Products: Number(metrics?.expiring7Products || 0),
      expiring30Products: expiring30CombinedProducts,
      expiring90Products: Number(metrics?.expiring90Products || 0),

      // Expiry page metrics (batch-based)
      expiredBatches: Number(metrics?.expiredBatches || 0),
      expiring7Batches: Number(metrics?.expiring7Batches || 0),
      expiring30Batches: Number(metrics?.expiring30Batches || 0),
      expiring30CombinedBatches: expiring30CombinedBatches,
      expiring90Batches: Number(metrics?.expiring90Batches || 0),

      // Value metrics
      expiredUnits: Number(metrics?.expiredUnits || 0),
      expiredValue: Number(metrics?.expiredValue || 0),

      // Total inventory
      totalBatches: Number(metrics?.totalBatches || 0),
      totalProducts: Number(metrics?.totalProducts || 0),
      totalUnits: Number(metrics?.totalUnits || 0),
    };

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  /**
   * Invalidate cache when inventory changes
   */
  async invalidateCache(tenantId) {
    await cache.delPattern(`expiry:metrics:${tenantId}:*`);
  }
}

export default new ExpiryAnalyticsService();
