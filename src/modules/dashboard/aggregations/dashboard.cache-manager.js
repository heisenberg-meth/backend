import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

const CACHE_TTLS = {
  overview: 30,
  sales_summary: 15,
  inventory_health: 60,
  alerts: 10,
  live: 5,
};

class DashboardCacheManager {
  getCacheKey(tenantId, section, branchId = null) {
    return `dashboard:${section}:${tenantId}:${branchId || 'global'}`;
  }

  getTTL(section) {
    return CACHE_TTLS[section] || CACHE_TTLS.overview;
  }

  async get(tenantId, section, branchId = null) {
    const cacheKey = this.getCacheKey(tenantId, section, branchId);

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err, cacheKey }, 'Dashboard cache read failed');
    }

    return null;
  }

  async set(tenantId, section, data, branchId = null) {
    const cacheKey = this.getCacheKey(tenantId, section, branchId);
    const ttl = this.getTTL(section);

    try {
      await redisClient.set(cacheKey, JSON.stringify(data), 'EX', ttl);
    } catch (err) {
      logger.warn({ err, cacheKey }, 'Dashboard cache write failed');
    }
  }

  async invalidate(tenantId, section = null, branchId = null) {
    try {
      if (section) {
        const cacheKey = this.getCacheKey(tenantId, section, branchId);
        await redisClient.del(cacheKey);

        if (branchId) {
          const globalKey = this.getCacheKey(tenantId, section, null);
          await redisClient.del(globalKey);
        }
      } else {
        const pattern = branchId
          ? `dashboard:*:${tenantId}:${branchId}`
          : `dashboard:*:${tenantId}:*`;

        const keys = await scanKeys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      }
    } catch (err) {
      logger.error({ err, tenantId, section }, 'Dashboard cache invalidation failed');
    }
  }

  async invalidateAll(tenantId) {
    await this.invalidate(tenantId);
  }
}

export default new DashboardCacheManager();
