import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class RankingService {
  /**
   * Calculates sales velocity for the last 30 days and updates FastMovingMedicine.
   * Sales Velocity = Total Units Sold / 30
   */
  async updateFastMovers(tenantId) {
    logger.info(`[RankingService] Updating fast movers for tenant ${tenantId}`);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Aggregate sales data per medicine across branches
    const salesData = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: {
        sale: {
          tenantId,
          soldAt: { gte: thirtyDaysAgo },
          status: 'COMPLETED'
        }
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
          salesVelocity: Math.round((item._sum.quantity / 30) * 100) / 100, // units per day
        });
      }
    }

    // Sort descending by sales velocity to assign rankings
    fastMovers.sort((a, b) => b.salesVelocity - a.salesVelocity);
    
    let ranking = 1;
    for (const fm of fastMovers) {
      fm.ranking = ranking++;
    }

    // Upsert into DB. Doing this in a transaction or individually.
    // For simplicity and to handle upserts gracefully:
    for (const fm of fastMovers) {
      await prisma.fastMovingMedicine.upsert({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: null, // Null indicates overall tenant ranking. Can expand to branches later.
            medicineId: fm.medicineId
          }
        },
        update: {
          unitsSold: fm.unitsSold,
          salesVelocity: fm.salesVelocity,
          ranking: fm.ranking,
          calculatedAt: new Date()
        },
        create: {
          tenantId,
          medicineId: fm.medicineId,
          unitsSold: fm.unitsSold,
          salesVelocity: fm.salesVelocity,
          ranking: fm.ranking
        }
      });
    }

    logger.info(`[RankingService] Processed ${fastMovers.length} fast movers.`);
  }
}

export default new RankingService();
