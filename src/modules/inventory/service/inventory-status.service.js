/**
 * InventoryStatusService - Single Source of Truth
 * 
 * ALL inventory status calculations MUST go through this service.
 * No module may calculate status independently.
 * 
 * Status Priority: Expired > Out Of Stock > Low Stock > In Stock
 * Every medicine belongs to exactly ONE status bucket.
 */

import prisma from '../../../config/prisma.js';
import cache from '../../../shared/services/cache.service.js';
import logger from '../../../shared/utils/logger.js';

const CACHE_TTL = 120; // 2 minutes

class InventoryStatusService {
  /**
   * Calculate status for a single medicine based on its batches
   * 
   * @param {Object} medicine - Medicine with inventoryBatches
   * @returns {string} Status: "EXPIRED" | "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK"
   */
  calculateStatus(medicine) {
    if (!medicine) return 'IN_STOCK';

    const batches = medicine.inventoryBatches || [];
    const activeBatches = batches.filter(b => b.availableQuantity > 0 && !b.deletedAt);
    
    const totalAvailable = activeBatches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
    const reorderLevel = medicine.reorderLevel || medicine.reorderPoint || 10;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const hasExpiredBatches = activeBatches.some(b => {
      if (!b.expiryDate) return false;
      const expDate = new Date(b.expiryDate);
      expDate.setHours(0, 0, 0, 0);
      return expDate <= now;
    });

    // Priority: Expired > Out Of Stock > Low Stock > In Stock
    if (hasExpiredBatches && totalAvailable > 0) {
      // Has expired batches but also has non-expired stock
      // Check if ALL stock is expired
      const nonExpiredBatches = activeBatches.filter(b => {
        if (!b.expiryDate) return true;
        const expDate = new Date(b.expiryDate);
        expDate.setHours(0, 0, 0, 0);
        return expDate > now;
      });
      
      if (nonExpiredBatches.length === 0) {
        return 'EXPIRED';
      }
    }
    
    if (totalAvailable === 0) {
      return 'OUT_OF_STOCK';
    }
    
    if (totalAvailable <= reorderLevel) {
      return 'LOW_STOCK';
    }
    
    return 'IN_STOCK';
  }

  /**
   * Get unified inventory metrics for a tenant
   * This is THE source of truth for all inventory counts
   * 
   * @param {string} tenantId
   * @param {string|null} branchId
   * @returns {Object} Inventory metrics
   */
  async getInventoryMetrics(tenantId, branchId = null) {
    const cacheKey = `inventory:metrics:${tenantId}:${branchId || 'all'}`;
    
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const bId = branchId === 'null' || !branchId ? null : branchId;
    const branchCondition = bId 
      ? prisma.$queryRaw`AND ib."branchId" = ${bId}` 
      : prisma.$queryRaw``;

    // Single atomic query - all metrics from one source
    const [metrics] = await prisma.$queryRaw`
      WITH batch_data AS (
        SELECT 
          ib."medicineId",
          ib."availableQuantity",
          ib."purchasePrice",
          ib."expiryDate",
          ib."status" as batch_status,
          m."reorderLevel",
          m."name" as medicine_name
        FROM "InventoryBatch" ib
        JOIN "Medicine" m ON m."id" = ib."medicineId"
        WHERE ib."tenantId" = ${tenantId}
          AND ib."deletedAt" IS NULL
          AND m."deletedAt" IS NULL
          AND m."isActive" = true
          ${branchCondition}
      ),
      medicine_stats AS (
        SELECT
          "medicineId",
          SUM("availableQuantity") as total_stock,
          MAX("reorderLevel") as reorder_level,
          MIN("expiryDate") as earliest_expiry,
          SUM(CASE WHEN "expiryDate"::date < CURRENT_DATE THEN "availableQuantity" ELSE 0 END) as expired_stock,
          SUM(CASE WHEN "expiryDate"::date >= CURRENT_DATE AND "expiryDate"::date < CURRENT_DATE + INTERVAL '7 days' THEN "availableQuantity" ELSE 0 END) as expiring7_stock,
          SUM(CASE WHEN "expiryDate"::date >= CURRENT_DATE + INTERVAL '7 days' AND "expiryDate"::date < CURRENT_DATE + INTERVAL '30 days' THEN "availableQuantity" ELSE 0 END) as expiring30_stock,
          SUM(CASE WHEN "expiryDate"::date >= CURRENT_DATE + INTERVAL '30 days' AND "expiryDate"::date < CURRENT_DATE + INTERVAL '90 days' THEN "availableQuantity" ELSE 0 END) as expiring90_stock,
          SUM("availableQuantity" * COALESCE("purchasePrice", 0)) as inventory_value
        FROM batch_data
        WHERE "availableQuantity" > 0
        GROUP BY "medicineId"
      )
      SELECT
        COUNT(*) as total_sku,
        COUNT(*) FILTER (WHERE total_stock > 0 AND (earliest_expiry IS NULL OR earliest_expiry::date >= CURRENT_DATE) AND (earliest_expiry IS NULL OR earliest_expiry::date >= CURRENT_DATE + INTERVAL '30 days' OR earliest_expiry IS NULL OR total_stock > reorder_level)) as in_stock,
        COUNT(*) FILTER (WHERE total_stock > 0 AND total_stock <= reorder_level AND (earliest_expiry IS NULL OR earliest_expiry::date >= CURRENT_DATE)) as low_stock,
        COUNT(*) FILTER (WHERE total_stock = 0) as out_of_stock,
        COUNT(*) FILTER (WHERE total_stock > 0 AND earliest_expiry IS NOT NULL AND earliest_expiry::date < CURRENT_DATE) as expired,
        COUNT(*) FILTER (WHERE total_stock > 0 AND earliest_expiry IS NOT NULL AND earliest_expiry::date >= CURRENT_DATE AND earliest_expiry::date < CURRENT_DATE + INTERVAL '7 days') as expiring7,
        COUNT(*) FILTER (WHERE total_stock > 0 AND earliest_expiry IS NOT NULL AND earliest_expiry::date >= CURRENT_DATE + INTERVAL '7 days' AND earliest_expiry::date < CURRENT_DATE + INTERVAL '30 days') as expiring30,
        COUNT(*) FILTER (WHERE total_stock > 0 AND earliest_expiry IS NOT NULL AND earliest_expiry::date >= CURRENT_DATE + INTERVAL '30 days' AND earliest_expiry::date < CURRENT_DATE + INTERVAL '90 days') as expiring90,
        COALESCE(SUM(inventory_value), 0) as inventory_value,
        COALESCE(SUM(total_stock), 0) as total_stock,
        COUNT(*) FILTER (WHERE total_stock > 0 AND expired_stock > 0 AND (total_stock - expired_stock) > 0) as mixed_status_count
      FROM medicine_stats
    `;

    const totalSku = Number(metrics?.total_sku || 0);
    const inStock = Number(metrics?.in_stock || 0);
    const lowStock = Number(metrics?.low_stock || 0);
    const outOfStock = Number(metrics?.out_of_stock || 0);
    const expired = Number(metrics?.expired || 0);
    
    // Verify reconciliation
    const calculatedTotal = inStock + lowStock + outOfStock + expired;
    const reconciliationOk = calculatedTotal === totalSku;

    const result = {
      totalSku,
      inStock,
      lowStock,
      outOfStock,
      expired,
      expiring7: Number(metrics?.expiring7 || 0),
      expiring30: Number(metrics?.expiring30 || 0),
      expiring30Combined: Number(metrics?.expiring7 || 0) + Number(metrics?.expiring30 || 0),
      expiring90: Number(metrics?.expiring90 || 0),
      inventoryValue: Number(metrics?.inventory_value || 0),
      totalStock: Number(metrics?.total_stock || 0),
      mixedStatusCount: Number(metrics?.mixed_status_count || 0),
      reconciliationOk,
      calculatedTotal,
    };

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  /**
   * Invalidate cache when inventory changes
   */
  async invalidateCache(tenantId) {
    await cache.delPattern(`inventory:metrics:${tenantId}:*`);
  }
}

export default new InventoryStatusService();
