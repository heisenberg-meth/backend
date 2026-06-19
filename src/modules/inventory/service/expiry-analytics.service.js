/**
 * ExpiryAnalyticsService - Single Source of Truth
 *
 * All expiry calculations MUST go through this service.
 * No module may calculate expiry independently.
 *
 * Dashboard, Expiry Page, Reports, Supplier Returns, Bulk Disposal
 * all consume from this service only.
 */

import unifiedInventorySummaryService from './unified-inventory-summary.service.js';

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
    const bId = branchId === 'null' || !branchId ? null : branchId;
    return unifiedInventorySummaryService.getExpiryMetrics(tenantId, bId);
  }

  /**
   * Invalidate cache when inventory changes
   */
  async invalidateCache(tenantId) {
    await unifiedInventorySummaryService.invalidateCache(tenantId);
  }
}

export default new ExpiryAnalyticsService();
