import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const BARCODE_CACHE_TTL = 86400;
const AUTOCOMPLETE_CACHE_TTL = 3600;
const SEARCH_CACHE_TTL = 300;
const POPULAR_SEARCH_TTL = 3600;

class MedicineSearchCache {
  async getBarcode(barcode, tenantId) {
    try {
      const key = this.barcodeKey(barcode, tenantId);
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.warn(`[Cache] Barcode lookup failed: ${err.message}`);
      return null;
    }
  }

  async setBarcode(barcode, tenantId, data) {
    try {
      const key = this.barcodeKey(barcode, tenantId);
      await redisClient.set(key, JSON.stringify(data), 'EX', BARCODE_CACHE_TTL);
    } catch (err) {
      logger.warn(`[Cache] Barcode cache set failed: ${err.message}`);
    }
  }

  async invalidateBarcode(barcode, tenantId) {
    try {
      const key = this.barcodeKey(barcode, tenantId);
      await redisClient.del(key);
    } catch (err) {
      logger.warn(`[Cache] Barcode cache invalidation failed: ${err.message}`);
    }
  }

  async getSku(sku, tenantId) {
    try {
      const key = this.skuKey(sku, tenantId);
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.warn(`[Cache] SKU lookup failed: ${err.message}`);
      return null;
    }
  }

  async setSku(sku, tenantId, data) {
    try {
      const key = this.skuKey(sku, tenantId);
      await redisClient.set(key, JSON.stringify(data), 'EX', BARCODE_CACHE_TTL);
    } catch (err) {
      logger.warn(`[Cache] SKU cache set failed: ${err.message}`);
    }
  }

  async getAutocomplete(prefix, tenantId) {
    try {
      const key = this.autocompleteKey(prefix, tenantId);
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.warn(`[Cache] Autocomplete lookup failed: ${err.message}`);
      return null;
    }
  }

  async setAutocomplete(prefix, tenantId, data) {
    try {
      const key = this.autocompleteKey(prefix, tenantId);
      await redisClient.set(key, JSON.stringify(data), 'EX', AUTOCOMPLETE_CACHE_TTL);
    } catch (err) {
      logger.warn(`[Cache] Autocomplete cache set failed: ${err.message}`);
    }
  }

  async getSearch(query, tenantId, options) {
    try {
      const key = this.searchKey(query, tenantId, options);
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.warn(`[Cache] Search lookup failed: ${err.message}`);
      return null;
    }
  }

  async setSearch(query, tenantId, options, data) {
    try {
      const key = this.searchKey(query, tenantId, options);
      await redisClient.set(key, JSON.stringify(data), 'EX', SEARCH_CACHE_TTL);
    } catch (err) {
      logger.warn(`[Cache] Search cache set failed: ${err.message}`);
    }
  }

  async getPopularSearches(tenantId) {
    try {
      const key = this.popularSearchKey(tenantId);
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      logger.warn(`[Cache] Popular searches lookup failed: ${err.message}`);
      return null;
    }
  }

  async setPopularSearches(tenantId, data) {
    try {
      const key = this.popularSearchKey(tenantId);
      await redisClient.set(key, JSON.stringify(data), 'EX', POPULAR_SEARCH_TTL);
    } catch (err) {
      logger.warn(`[Cache] Popular searches cache set failed: ${err.message}`);
    }
  }

  async invalidateAll(tenantId) {
    try {
      const keys = await redisClient.keys(`medicine-search:${tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn(`[Cache] Cache invalidation failed: ${err.message}`);
    }
  }

  barcodeKey(barcode, tenantId) {
    return `medicine-search:${tenantId}:barcode:${barcode}`;
  }

  skuKey(sku, tenantId) {
    return `medicine-search:${tenantId}:sku:${sku}`;
  }

  autocompleteKey(prefix, tenantId) {
    return `medicine-search:${tenantId}:autocomplete:${prefix.toLowerCase()}`;
  }

  searchKey(query, tenantId, options) {
    const optStr = JSON.stringify(options || {});
    return `medicine-search:${tenantId}:search:${query.toLowerCase()}:${optStr}`;
  }

  popularSearchKey(tenantId) {
    return `medicine-search:${tenantId}:popular-searches`;
  }
}

export default new MedicineSearchCache();
