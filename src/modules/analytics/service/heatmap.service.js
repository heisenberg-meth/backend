import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class HeatmapService {
  /**
   * Generates hourly and weekday revenue aggregates for the heatmap.
   * Based on the last 90 days.
   */
  async updateRevenueHeatmap(tenantId) {
    logger.info(`[HeatmapService] Updating revenue heatmap for tenant ${tenantId}`);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: { gte: ninetyDaysAgo },
        status: 'COMPLETED',
      },
      select: { soldAt: true, totalAmount: true },
    });

    const matrix = Array(7)
      .fill(null)
      .map(() =>
        Array(24)
          .fill(null)
          .map(() => ({ revenue: 0, transactionCount: 0 })),
      );

    for (const sale of sales) {
      const date = new Date(sale.soldAt);
      const weekday = date.getDay();
      const hour = date.getHours();

      matrix[weekday][hour].revenue += sale.totalAmount;
      matrix[weekday][hour].transactionCount += 1;
    }

    await prisma.revenueHeatmap.deleteMany({
      where: { tenantId, branchId: null },
    });

    const heatmapData = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let hour = 0; hour < 24; hour++) {
        if (matrix[weekday][hour].transactionCount > 0) {
          heatmapData.push({
            tenantId,
            branchId: null,
            hourSlot: hour,
            weekday,
            revenue: matrix[weekday][hour].revenue,
            transactionCount: matrix[weekday][hour].transactionCount,
          });
        }
      }
    }

    if (heatmapData.length > 0) {
      await prisma.revenueHeatmap.createMany({
        data: heatmapData,
      });
    }

    logger.info(`[HeatmapService] Generated ${heatmapData.length} heatmap data points.`);
  }
}

export default new HeatmapService();
