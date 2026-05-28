import inventoryBatchRepository from '../repository/inventory_batch.repository.js';

class ExpiryService {
  /**
   * Get batches that are expiring within the specified days
   */
  async getNearExpiryBatches(tenantId, days = 30) {
    return inventoryBatchRepository.getNearExpiry(tenantId, days);
  }

  /**
   * Get a dashboard summary of expiries
   */
  async getExpirySummary(tenantId) {
    const [expired, near30, near60, near90] = await Promise.all([
      inventoryBatchRepository.getNearExpiry(tenantId, 0),
      inventoryBatchRepository.getNearExpiry(tenantId, 30),
      inventoryBatchRepository.getNearExpiry(tenantId, 60),
      inventoryBatchRepository.getNearExpiry(tenantId, 90),
    ]);

    return {
      expired: expired.length,
      expiring30Days: near30.length,
      expiring60Days: near60.length,
      expiring90Days: near90.length,
    };
  }
}

export default new ExpiryService();
