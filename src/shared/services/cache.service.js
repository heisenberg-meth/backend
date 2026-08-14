/**
 * Redis Caching Service
 * Provides TTL-based caching with automatic invalidation
 */

import redis from '../../config/redis.js';
import logger from '../utils/logger.js';

const DEFAULT_TTL = 300; // 5 minutes
const PREFIX = 'cache:';

class CacheService {
  /**
   * Get a cached value
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null
   */
  async get(key) {
    try {
      const cached = await redis.get(`${PREFIX}${key}`);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache GET failed');
      return null;
    }
  }

  /**
   * Set a cached value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (default: 300)
   */
  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(`${PREFIX}${key}`, ttl, serialized);
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache SET failed');
    }
  }

  /**
   * Delete a cached value
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      await redis.del(`${PREFIX}${key}`);
    } catch (error) {
      logger.warn({ key, error: error.message }, 'Cache DEL failed');
    }
  }

  /**
   * Delete multiple keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., "invoices:*")
   */
  async delPattern(pattern) {
    try {
      const keys = await redis.keys(`${PREFIX}${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info({ pattern, count: keys.length }, 'Cache invalidation');
      }
    } catch (error) {
      logger.warn({ pattern, error: error.message }, 'Cache DEL pattern failed');
    }
  }

  /**
   * Get or set cached value
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not cached
   * @param {number} ttl - Time to live in seconds
   */
  async getOrSet(key, fetchFn, ttl = DEFAULT_TTL) {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Clear all cache for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async clearTenant(tenantId) {
    await this.delPattern(`tenant:${tenantId}:*`);
  }

  /**
   * Clear cache for a specific module
   * @param {string} module - Module name (e.g., "invoices", "medicines")
   * @param {string} tenantId - Tenant ID
   */
  async clearModule(module, tenantId) {
    await this.delPattern(`tenant:${tenantId}:${module}:*`);
  }
}

const cache = new CacheService();
export default cache;
