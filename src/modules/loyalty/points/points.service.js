import prisma from '../../../config/prisma.js';
import ledgerService from '../ledgers/ledger.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import analyticsService from '../analytics/analytics.service.js';

class PointsService {
  /**
   * Reward ratio: ₹10 spent = 1 point
   */
  getRewardRatio() {
    return 10;
  }

  async getAccount(patientId, tenantId, tx = null) {
    const client = tx || prisma;
    let account = await client.patientLoyaltyAccount.findUnique({
      where: { patientId },
    });
    if (!account) {
      account = await client.patientLoyaltyAccount.create({
        data: { tenantId, patientId },
      });
    }
    return account;
  }

  async earnPoints(tenantId, patientId, amount, invoiceId, tx) {
    const points = Math.floor(amount / this.getRewardRatio());
    if (points <= 0) return;

    const execute = async (client) => {
      const account = await this.getAccount(patientId, tenantId, client);
      const newBalance = account.availablePoints + points;
      const newLifetime = account.lifetimePoints + points;

      await ledgerService.recordLoyaltyTransaction(
        {
          tenantId,
          patientId,
          type: 'EARNED',
          points,
          runningBalance: newBalance,
          referenceType: 'INVOICE',
          referenceId: invoiceId,
          notes: `Earned from invoice #${invoiceId}`,
        },
        client,
      );

      const updatedAccount = await client.patientLoyaltyAccount.update({
        where: { id: account.id },
        data: {
          availablePoints: newBalance,
          lifetimePoints: newLifetime,
          loyaltyTier: this.calculateTier(newLifetime),
        },
      });

      eventBus.emit('LOYALTY_POINTS_EARNED', { tenantId, patientId, points, newBalance });

      return updatedAccount;
    };

    if (tx) {
      return await execute(tx);
    } else {
      return await prisma.$transaction(execute);
    }
  }

  calculateTier(lifetimePoints) {
    if (lifetimePoints >= 10000) return 'PLATINUM';
    if (lifetimePoints >= 5000) return 'GOLD';
    if (lifetimePoints >= 1000) return 'SILVER';
    return 'BRONZE';
  }

  async getHistory(patientId) {
    return await prisma.loyaltyTransaction.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAnalytics(tenantId) {
    return await analyticsService.getLoyaltyAnalytics(tenantId);
  }
}

export default new PointsService();
