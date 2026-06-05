import redisClient from '../../../config/redis.js';
import dailySummaryRepository from '../repositories/daily_summary.repository.js';
import aggregationService from './aggregation.service.js';
import reportQueryService from './report.query.service.js';
import logger from '../../../shared/utils/logger.js';

class ReportService {
  async ensureSummaries(tenantId, from, to) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingSales = await dailySummaryRepository.getSalesSummaries(
      tenantId,
      fromDate,
      toDate,
    );
    const existingPurchases = await dailySummaryRepository.getPurchaseSummaries(
      tenantId,
      fromDate,
      toDate,
    );
    const existingFinances = await dailySummaryRepository.getFinanceSummaries(
      tenantId,
      fromDate,
      toDate,
    );

    const salesDates = new Set(existingSales.map((s) => s.salesDate.toISOString().split('T')[0]));
    const purchaseDates = new Set(
      existingPurchases.map((p) => p.reportDate.toISOString().split('T')[0]),
    );
    const financeDates = new Set(
      existingFinances.map((f) => f.reportDate.toISOString().split('T')[0]),
    );

    let current = new Date(fromDate);
    const datesToAggregate = [];

    while (current <= toDate) {
      const dateStr = current.toISOString().split('T')[0];
      const isToday = current.getTime() === today.getTime();

      if (
        isToday ||
        !salesDates.has(dateStr) ||
        !purchaseDates.has(dateStr) ||
        !financeDates.has(dateStr)
      ) {
        datesToAggregate.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    for (const date of datesToAggregate) {
      try {
        await aggregationService.runDailyAggregation(tenantId, date);
      } catch (err) {
        logger.error({ err, date, tenantId }, 'Inline dynamic aggregation failed');
      }
    }
  }

  async getSalesReport(tenantId, from, to) {
    await this.ensureSummaries(tenantId, from, to);

    const cacheKey = `reports:sales:${tenantId}:${from}:${to}`;
    const toDateObj = new Date(to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isLive = toDateObj >= today;

    if (!isLive) {
      const cached = await this.getCached(cacheKey);
      if (cached) return cached;
    }

    const data = await reportQueryService.getSalesReportData(tenantId, from, to);

    if (!isLive) {
      await this.setCache(cacheKey, data);
    }
    return data;
  }

  async getPurchaseReport(tenantId, from, to) {
    await this.ensureSummaries(tenantId, from, to);

    const cacheKey = `reports:purchase:${tenantId}:${from}:${to}`;
    const toDateObj = new Date(to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isLive = toDateObj >= today;

    if (!isLive) {
      const cached = await this.getCached(cacheKey);
      if (cached) return cached;
    }

    const data = await reportQueryService.getPurchaseReportData(tenantId, from, to);

    if (!isLive) {
      await this.setCache(cacheKey, data);
    }
    return data;
  }

  async getFinanceReport(tenantId, from, to) {
    await this.ensureSummaries(tenantId, from, to);

    const cacheKey = `reports:finance:${tenantId}:${from}:${to}`;
    const toDateObj = new Date(to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isLive = toDateObj >= today;

    if (!isLive) {
      const cached = await this.getCached(cacheKey);
      if (cached) return cached;
    }

    const data = await reportQueryService.getPnlReportData(tenantId, from, to);

    if (!isLive) {
      await this.setCache(cacheKey, data);
    }
    return data;
  }

  async getCached(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.error({ err }, 'Redis get error');
      return null;
    }
  }

  async setCache(key, data) {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', 300); // 5 mins
    } catch (err) {
      logger.error({ err }, 'Redis set error');
    }
  }

  async invalidateCache(tenantId) {
    try {
      const stream = redisClient.scanStream({
        match: `reports:*:${tenantId}:*`,
        count: 100,
      });

      stream.on('data', async (keys) => {
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      });

      stream.on('error', (err) => {
        logger.error({ err }, 'Redis scan stream error during cache invalidation');
      });
    } catch (err) {
      logger.error({ err }, 'Redis del error');
    }
  }
}

export default new ReportService();
