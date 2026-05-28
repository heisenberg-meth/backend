import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AggregationService {
  /**
   * Run nightly metric aggregation for executive dashboards
   */
  async runDailyAggregation(tenantId) {
    const branches = await prisma.branch.findMany({ where: { tenantId } });

    for (const branch of branches) {
      // Aggregate Sales
      const sales = await prisma.sale.aggregate({
        where: { branchId: branch.id, soldAt: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        _sum: { totalAmount: true }
      });

      // Persist Revenue Snapshot
      await prisma.revenueSnapshot.upsert({
        where: {
          tenantId_branchId_snapshotDate: {
            tenantId,
            branchId: branch.id,
            snapshotDate: new Date().toISOString().split('T')[0],
          },
        },
        update: {
          totalSales: sales._sum.totalAmount || 0,
        },
        create: {
          tenantId,
          branchId: branch.id,
          snapshotDate: new Date().toISOString().split('T')[0],
          totalSales: sales._sum.totalAmount || 0,
          grossProfit: 0,
          netProfit: 0,
        },
      });
    }
    logger.info({ tenantId }, '[DASHBOARD_SERVICE] Daily aggregation completed');
  }
}

export default new AggregationService();
