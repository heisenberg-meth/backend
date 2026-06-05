import prisma from '../../../config/prisma.js';

class AnalyticsService {
  async getLoyaltyAnalytics(tenantId) {
    const [totalPointsEarned, totalPointsRedeemed, topEarners, tierDistribution] =
      await Promise.all([
        prisma.loyaltyTransaction.aggregate({
          where: { tenantId, type: 'EARNED' },
          _sum: { points: true },
        }),
        prisma.loyaltyTransaction.aggregate({
          where: { tenantId, type: 'REDEEMED' },
          _sum: { points: true },
        }),
        prisma.patientLoyaltyAccount.findMany({
          where: { tenantId },
          take: 5,
          orderBy: { lifetimePoints: 'desc' },
          include: { patient: { select: { fullName: true, phone: true } } },
        }),
        prisma.patientLoyaltyAccount.groupBy({
          by: ['loyaltyTier'],
          where: { tenantId },
          _count: { id: true },
        }),
      ]);

    return {
      pointsStats: {
        earned: totalPointsEarned._sum.points || 0,
        redeemed: Math.abs(totalPointsRedeemed._sum.points || 0),
      },
      topEarners,
      tierDistribution,
    };
  }

  async getCreditRiskAnalytics(tenantId) {
    const [totalOutstanding, overdueAccounts, blockedAccounts] = await Promise.all([
      prisma.patientCreditAccount.aggregate({
        where: { tenantId },
        _sum: { outstandingBalance: true },
      }),
      prisma.patientCreditAccount.count({
        where: { tenantId, accountStatus: 'OVERDUE' },
      }),
      prisma.patientCreditAccount.count({
        where: { tenantId, accountStatus: 'BLOCKED' },
      }),
    ]);

    return {
      totalOutstanding: totalOutstanding._sum.outstandingBalance || 0,
      overdueCount: overdueAccounts,
      blockedCount: blockedAccounts,
    };
  }
}

export default new AnalyticsService();
