import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class RankingService {
  async updateFastMovers(tenantId) {
    logger.info(`[RankingService] Updating fast movers for tenant ${tenantId}`);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesData = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: {
        sale: {
          tenantId,
          soldAt: { gte: thirtyDaysAgo },
          status: 'COMPLETED',
        },
      },
      _sum: { quantity: true },
    });

    const fastMovers = [];

    for (const item of salesData) {
      if (item._sum.quantity > 0) {
        fastMovers.push({
          tenantId,
          medicineId: item.medicineId,
          unitsSold: item._sum.quantity,
          salesVelocity: Math.round((item._sum.quantity / 30) * 100) / 100,
        });
      }
    }

    fastMovers.sort((a, b) => b.salesVelocity - a.salesVelocity);

    let ranking = 1;
    for (const fm of fastMovers) {
      fm.ranking = ranking++;
    }

    for (const fm of fastMovers) {
      await prisma.fastMovingMedicine.upsert({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: null,
            medicineId: fm.medicineId,
          },
        },
        update: {
          unitsSold: fm.unitsSold,
          salesVelocity: fm.salesVelocity,
          ranking: fm.ranking,
          calculatedAt: new Date(),
        },
        create: {
          tenantId,
          medicineId: fm.medicineId,
          unitsSold: fm.unitsSold,
          salesVelocity: fm.salesVelocity,
          ranking: fm.ranking,
        },
      });
    }

    logger.info(`[RankingService] Processed ${fastMovers.length} fast movers.`);
  }
}

export default new RankingService();
