import medicineSearchRepository from '../repositories/medicine-search.repository.js';
import medicineSearchCache from '../cache/medicine-search.cache.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

class MedicineSearchService {
  async search(tenantId, query, options = {}) {
    const { limit, category, schedule, branchId, inStockOnly } = options;

    const cacheOptions = { limit, category, schedule, branchId, inStockOnly };
    const cached = await medicineSearchCache.getSearch(query, tenantId, cacheOptions);
    if (cached) {
      return { results: cached, source: 'cache' };
    }

    const results = await medicineSearchRepository.search(tenantId, query, {
      limit,
      category,
      schedule,
      branchId,
      inStockOnly,
    });

    const filteredResults = results.filter(Boolean);

    await medicineSearchCache.setSearch(query, tenantId, cacheOptions, filteredResults);

    await this.trackSearch(tenantId, query, filteredResults.length);

    emitLocalEvent(DOMAIN_EVENTS.MEDICINE_SEARCHED, {
      tenantId,
      query,
      resultCount: filteredResults.length,
      timestamp: new Date().toISOString(),
    });

    return { results: filteredResults, source: 'database' };
  }

  async fuzzySearch(tenantId, query, limit = 20) {
    const results = await medicineSearchRepository.fuzzySearch(tenantId, query, limit);

    await this.trackSearch(tenantId, query, results.length, { fuzzy: true });

    emitLocalEvent(DOMAIN_EVENTS.MEDICINE_SEARCHED, {
      tenantId,
      query,
      resultCount: results.length,
      fuzzy: true,
      timestamp: new Date().toISOString(),
    });

    return results;
  }

  async autocomplete(tenantId, prefix, limit = 10) {
    const cached = await medicineSearchCache.getAutocomplete(prefix, tenantId);
    if (cached) {
      return { suggestions: cached, source: 'cache' };
    }

    const suggestions = await medicineSearchRepository.autocomplete(tenantId, prefix, limit);

    await medicineSearchCache.setAutocomplete(prefix, tenantId, suggestions);

    return { suggestions, source: 'database' };
  }

  async getAlternatives(medicineId, tenantId, limit = 10) {
    return medicineSearchRepository.findAlternatives(medicineId, tenantId, limit);
  }

  async getAvailability(medicineId, tenantId) {
    return medicineSearchRepository.getAvailability(medicineId, tenantId);
  }

  async getPopularSearches(tenantId, limit = 20) {
    const cached = await medicineSearchCache.getPopularSearches(tenantId);
    if (cached) {
      return cached;
    }

    let searches = await medicineSearchRepository.getPopularSearches(tenantId, limit);

    if (searches.length === 0) {
      const medicines = await prisma.medicine.findMany({
        where: { tenantId, isActive: true, deletedAt: null },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: limit,
      });
      searches = medicines.map((m) => ({ query: m.name, count: 0 }));
    }

    await medicineSearchCache.setPopularSearches(tenantId, searches);

    return searches;
  }

  async getFailedSearches(tenantId, limit = 20) {
    return medicineSearchRepository.getFailedSearches(tenantId, limit);
  }

  async trackSearch(tenantId, query, resultCount, metadata = {}) {
    try {
      await prisma.searchAnalytics.upsert({
        where: {
          tenantId_query: {
            tenantId,
            query: query.toLowerCase(),
          },
        },
        create: {
          tenantId,
          query: query.toLowerCase(),
          resultCount,
          count: 1,
          lastSearchedAt: new Date(),
          ...metadata,
        },
        update: {
          count: { increment: 1 },
          resultCount,
          lastSearchedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn(`[SearchAnalytics] Failed to track search: ${err.message}`);
    }
  }

  async trackFailedSearch(tenantId, query) {
    try {
      await prisma.searchAnalytics.upsert({
        where: {
          tenantId_query: {
            tenantId,
            query: query.toLowerCase(),
          },
        },
        create: {
          tenantId,
          query: query.toLowerCase(),
          resultCount: 0,
          count: 1,
          lastSearchedAt: new Date(),
        },
        update: {
          count: { increment: 1 },
          resultCount: 0,
          lastSearchedAt: new Date(),
        },
      });
    } catch (err) {
      logger.warn(`[SearchAnalytics] Failed to track failed search: ${err.message}`);
    }
  }
}

export default new MedicineSearchService();
