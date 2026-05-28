import prisma from '../../../config/prisma.js';

class FraudService {
  /**
   * Check for rapid point farming or duplicate redemptions
   */
  async detectLoyaltyAbuse(patientId) {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentTransactions = await prisma.loyaltyTransaction.count({
      where: {
        patientId,
        createdAt: { gte: oneHourAgo },
      },
    });

    // Threshold: More than 5 transactions per hour is suspicious
    if (recentTransactions > 5) {
      return { suspicious: true, flags: ['RAPID_POINT_ACCUMULATION'] };
    }

    return { suspicious: false };
  }
}

export default new FraudService();
