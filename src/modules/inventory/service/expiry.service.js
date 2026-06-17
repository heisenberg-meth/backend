import inventoryBatchRepository from '../repository/inventory_batch.repository.js';
import analyticsRepository from '../../analytics/repository/analytics.repository.js';

class ExpiryService {
  /**
   * Get batches that are expiring within the specified days
   */
  async getNearExpiryBatches(tenantId, days = 30, branchId = null) {
    return inventoryBatchRepository.getNearExpiry(tenantId, days, branchId);
  }

  /**
   * Get a dashboard summary of expiries
   */
  async getExpirySummary(tenantId, branchId = null) {
    const [expired, expiring30, expiring60, expiring90] = await Promise.all([
      inventoryBatchRepository.getNearExpiry(tenantId, 0, branchId),
      analyticsRepository.getExpiringCount(tenantId, 30, branchId),
      analyticsRepository.getExpiringCount(tenantId, 60, branchId),
      analyticsRepository.getExpiringCount(tenantId, 90, branchId),
    ]);

    return {
      expired: expired.length,
      expiring30Days: expiring30,
      expiring60Days: expiring60,
      expiring90Days: expiring90,
    };
  }
}

export default new ExpiryService();
