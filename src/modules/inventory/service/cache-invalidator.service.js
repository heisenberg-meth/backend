import medicineInventoryService from './medicine.prisma.service.js';
import expiryAnalyticsService from './expiry-analytics.service.js';
import inventoryStatusService from './inventory-status.service.js';
import unifiedInventorySummaryService from './unified-inventory-summary.service.js';

import logger from '../../../shared/utils/logger.js';
import redisClient from '../../../config/redis.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

class CacheInvalidatorService {
  async invalidateInventoryCaches(tenantId, medicineIds = []) {
    try {
      await medicineInventoryService.invalidateCache(tenantId);

      // Also invalidate expiry metrics cache
      await expiryAnalyticsService.invalidateCache(tenantId);

      // Also invalidate inventory reconciliation cache
      await inventoryStatusService.invalidateCache(tenantId);

      // Also invalidate unified inventory summary cache
      await unifiedInventorySummaryService.invalidateCache(tenantId);

      const ids = Array.isArray(medicineIds) ? medicineIds : [medicineIds].filter(Boolean);

      if (ids.length > 0) {
        const keysToDelete = ids.map((id) => `stock:current:${tenantId}:${id}`);
        await redisClient.del(...keysToDelete);
      } else {
        const stockKeys = await scanKeys(`stock:current:${tenantId}:*`);
        if (stockKeys.length > 0) {
          await redisClient.del(...stockKeys);
        }
      }

      logger.info(
        { tenantId, medicineIds: ids },
        '[CACHE_INVALIDATOR] Inventory caches invalidated successfully',
      );
    } catch (err) {
      logger.error(
        { err, tenantId, medicineIds },
        '[CACHE_INVALIDATOR] Failed to invalidate inventory caches',
      );
    }
  }
}

export default new CacheInvalidatorService();
