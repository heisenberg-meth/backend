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
   * Precedence: Expired > Out Of Stock > Expiring Soon > Low Stock > In Stock
   *
   * @param {Object} medicine - Medicine with inventoryBatches
   * @returns {string} Status: "EXPIRED" | "OUT_OF_STOCK" | "EXPIRING_SOON" | "LOW_STOCK" | "IN_STOCK"
   */
  calculateStatus(medicine) {
    if (!medicine) return 'IN_STOCK';

    const batches = medicine.inventoryBatches || medicine.batches || [];
    const activeBatches = batches.filter(
      (b) =>
        (b.availableQuantity ?? b.quantity ?? 0) > 0 && !b.deletedAt && b.status !== 'ARCHIVED',
    );

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const expiredBatches = activeBatches.filter((b) => {
      if (b.status === 'EXPIRED') return true;
      if (!b.expiryDate) return false;
      const expDate = new Date(b.expiryDate);
      expDate.setHours(0, 0, 0, 0);
      return expDate < now;
    });

    const unexpiredBatches = activeBatches.filter((b) => {
      if (b.status === 'EXPIRED') return false;
      if (!b.expiryDate) return true;
      const expDate = new Date(b.expiryDate);
      expDate.setHours(0, 0, 0, 0);
      return expDate >= now;
    });

    let usableStock = unexpiredBatches.reduce(
      (sum, b) => sum + (b.availableQuantity ?? b.quantity ?? 0),
      0,
    );

    // If no batches array but stock fields are directly on medicine
    if (batches.length === 0) {
      usableStock = Number(
        medicine.availableStock ??
          medicine.stock ??
          medicine.currentStock ??
          medicine.availableQuantity ??
          0,
      );
    }

    const reorderLevel = Number(medicine.reorderLevel || medicine.reorderPoint || 10);

    // 1. Expired: Has expired batches and 0 usable unexpired stock
    if (expiredBatches.length > 0 && usableStock === 0) {
      return 'EXPIRED';
    }

    // 2. Out Of Stock: 0 usable stock and no expired stock
    if (usableStock === 0) {
      return 'OUT_OF_STOCK';
    }

    // 3. Expiring Soon: usableStock > 0 and next expiry <= 30 days
    const nextUnexpired = [...unexpiredBatches]
      .filter((b) => b.expiryDate)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0];

    const nextExpiry = nextUnexpired?.expiryDate || medicine.expiryDate;
    if (nextExpiry) {
      const expDate = new Date(nextExpiry);
      expDate.setHours(0, 0, 0, 0);
      if (expDate <= thirtyDays && expDate >= now) {
        return 'EXPIRING_SOON';
      }
    }

    // 4. Low Stock: usableStock <= reorder
    if (usableStock <= reorderLevel) {
      return 'LOW_STOCK';
    }

    // 5. In Stock
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
