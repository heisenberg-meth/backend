import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

export async function processAnalyticsAggregation(data) {
  const { tenantId } = data;

  logger.info(`[Worker] Aggregating search analytics for tenant ${tenantId}`);

  try {
    const topSearches = await prisma.searchAnalytics.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { count: 'desc' },
      take: 50,
      select: {
        query: true,
        count: true,
        resultCount: true,
      },
    });

    const zeroResultSearches = topSearches.filter((s) => s.resultCount === 0);

    logger.info(
      `[Worker] Analytics aggregated: ${topSearches.length} searches, ${zeroResultSearches.length} zero-result`
    );

    return {
      tenantId,
      totalSearches: topSearches.length,
      zeroResultSearches: zeroResultSearches.length,
      topQueries: topSearches.slice(0, 10),
    };
  } catch (err) {
    logger.error(`[Worker] Analytics aggregation failed: ${err.message}`);
    throw err;
  }
}
