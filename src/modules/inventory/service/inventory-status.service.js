/**
 * InventoryStatusService - Single Source of Truth
 *
 * ALL inventory status calculations MUST go through this service.
 * No module may calculate status independently.
 *
 * Status Priority: Expired > Out Of Stock > Low Stock > In Stock
 * Every medicine belongs to exactly ONE status bucket.
 */

import cache from '../../../shared/services/cache.service.js';
import unifiedInventorySummaryService from './unified-inventory-summary.service.js';

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
    const activeBatches = batches.filter((b) => b.availableQuantity > 0 && !b.deletedAt);

    const totalAvailable = activeBatches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
    const reorderLevel = medicine.reorderLevel || medicine.reorderPoint || 10;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const hasExpiredBatches = activeBatches.some((b) => {
      if (!b.expiryDate) return false;
      const expDate = new Date(b.expiryDate);
      expDate.setHours(0, 0, 0, 0);
      return expDate <= now;
    });

    // Priority: Expired > Out Of Stock > Low Stock > In Stock
    if (hasExpiredBatches && totalAvailable > 0) {
      // Has expired batches but also has non-expired stock
      // Check if ALL stock is expired
      const nonExpiredBatches = activeBatches.filter((b) => {
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
    const summary = await unifiedInventorySummaryService.getUnifiedSummary(tenantId, bId);
    const expiry = await unifiedInventorySummaryService.getExpiryMetrics(tenantId, bId);

    const calculatedTotal =
      summary.inStockCount +
      summary.lowStockCount +
      summary.outOfStockCount +
      expiry.expiredBatches;

    const result = {
      totalSku: summary.totalMedicines,
      inStock: summary.inStockCount,
      lowStock: summary.lowStockCount,
      outOfStock: summary.outOfStockCount,
      expired: expiry.expiredBatches,
      expiring7: expiry.expiring7Batches,
      expiring30: expiry.expiring30Batches,
      expiring30Combined: expiry.expiring30CombinedBatches,
      expiring90: expiry.expiring90Batches,
      inventoryValue: summary.inventoryValue,
      totalStock: summary.totalStock,
      mixedStatusCount: 0,
      reconciliationOk: calculatedTotal === summary.totalMedicines,
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
