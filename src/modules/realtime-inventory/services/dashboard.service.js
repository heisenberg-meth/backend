import redisClient from '../../../config/redis.js';
import prisma from '../../../config/prisma.js';

class DashboardService {
  async getLiveStats(tenantId, branchId = null) {
    const cacheKey = `dashboard:live:${tenantId}:${branchId || 'global'}`;
    let stats = await redisClient.get(cacheKey);

    if (stats) {
      return JSON.parse(stats);
    }

    // If cache miss, aggregate from DB
    stats = await this.aggregateStats(tenantId, branchId);

    // Cache for short duration (e.g., 1 minute)
    await redisClient.setex(cacheKey, 60, JSON.stringify(stats));

    return stats;
  }

  async aggregateStats(tenantId, branchId) {
    const [totalSales, lowStockCount, expiringSoon] = await Promise.all([
      prisma.sale.aggregate({
        where: { tenantId, branchId, soldAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        _sum: { totalAmount: true },
      }),
      prisma.inventoryBatch.count({
        where: {
          medicine: { tenantId },
          branchId,
          quantity: { lte: 10 },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      prisma.inventoryBatch.count({
        where: {
          medicine: { tenantId },
          branchId,
          expiryDate: {
            gte: new Date(),
            lte: new Date(new Date().setDate(new Date().getDate() + 90)),
          },
          quantity: { gt: 0 },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
    ]);

    return {
      todaySales: totalSales._sum.totalAmount || 0,
      lowStockItems: lowStockCount,
      expiringItems: expiringSoon,
      timestamp: new Date(),
    };
  }

  /**
   * Called by background workers or events to refresh cache
   */
  async refreshDashboardCache(tenantId, branchId = null) {
    const stats = await this.aggregateStats(tenantId, branchId);
    const cacheKey = `dashboard:live:${tenantId}:${branchId || 'global'}`;
    await redisClient.setex(cacheKey, 60, JSON.stringify(stats));
    return stats;
  }
}

export default new DashboardService();
