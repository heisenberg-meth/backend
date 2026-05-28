import prisma from '../../../config/prisma.js';
import ledgerService from '../ledgers/ledger.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import pointsService from '../points/points.service.js';

class RedemptionService {
  /**
   * Conversion rate: 10 points = ₹1
   */
  getConversionRate() {
    return 0.1;
  }

  async redeemPoints(tenantId, patientId, points, referenceId = null, tx) {
    const client = tx || prisma;

    return await client.$transaction(async (ctx) => {
      const account = await pointsService.getAccount(patientId, tenantId);

      if (account.availablePoints < points) {
        throw new Error('Insufficient loyalty points');
      }

      const newBalance = account.availablePoints - points;
      const redeemableValue = points * this.getConversionRate();

      await ledgerService.recordLoyaltyTransaction({
        tenantId,
        patientId,
        type: 'REDEEMED',
        points: -points,
        runningBalance: newBalance,
        referenceType: referenceId ? 'INVOICE' : 'REDEMPTION',
        referenceId,
        notes: `Redeemed ${points} points for ₹${redeemableValue} discount`,
      }, ctx);

      await ctx.patientLoyaltyAccount.update({
        where: { id: account.id },
        data: { availablePoints: newBalance },
      });

      eventBus.emit('LOYALTY_REDEEMED', { tenantId, patientId, points, redeemableValue });

      return { points, redeemableValue, newBalance };
    });
  }
}

export default new RedemptionService();
