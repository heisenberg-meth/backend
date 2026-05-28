import loyaltyRepository from '../repositories/loyalty.repository.js';
import patientRepository from '../repositories/patient.repository.js';
import prisma from '../../../config/prisma.js';

class LoyaltyService {
  /**
   * Earn points based on invoice amount
   * Rule: 1 point per ₹100
   */
  async earnPoints(tenantId, patientId, amount, invoiceId, tx) {
    if (!patientId) return;
    const client = tx || prisma;

    const points = Math.floor(amount / 100);
    if (points <= 0) return;

    await loyaltyRepository.createTransaction(
      {
        tenantId,
        patientId,
        type: 'EARN',
        points,
        referenceType: 'INVOICE',
        referenceId: invoiceId,
      },
      client,
    );

    await client.patient.update({
      where: { id: patientId },
      data: { loyaltyPoints: { increment: points } }
    });
  }

  /**
   * Redeem points for a discount
   * Rule: 100 points = ₹10
   */
  async redeemPoints(tenantId, patientId, points, tx) {
    const client = tx || prisma;

    const patient = await patientRepository.findById(patientId, tenantId);
    if (patient.loyaltyPoints < points) {
      throw new Error('Insufficient loyalty points');
    }

    const discountValue = (points / 100) * 10;

    await loyaltyRepository.createTransaction({
      tenantId,
      patientId,
      type: 'REDEEM',
      points: -points,
      notes: `Redeemed for ₹${discountValue} discount`
    }, client);

    await client.patient.update({
      where: { id: patientId },
      data: { loyaltyPoints: { decrement: points } }
    });

    return discountValue;
  }

  async getLoyaltyHistory(patientId, tenantId) {
    return loyaltyRepository.findByCustomerId(patientId, tenantId);
  }

  /**
   * Expire points earned more than 1 year ago
   * This is a simplified version: find EARN transactions from 365 days ago
   * and record an EXPIRE transaction for the same amount.
   * Note: This assumes points are not partially expired.
   */
  async expireOldPoints() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    // Find EARN transactions from exactly one year ago that haven't been processed for expiry
    // In a real system, you'd need a way to track which EARN transactions are already expired or redeemed.
    // For this MVP, we'll just find EARN transactions from 1 year ago (start of day to end of day)
    const startOfDay = new Date(oneYearAgo);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(oneYearAgo);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: {
        type: 'EARN',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    for (const tx of transactions) {
      // Check if already expired (simplified check)
      const alreadyExpired = await prisma.loyaltyTransaction.findFirst({
        where: {
          patientId: tx.patientId,
          type: 'EXPIRE',
          referenceId: tx.id
        }
      });

      if (alreadyExpired) continue;

      // Get current patient points
      const patient = await prisma.patient.findUnique({
        where: { id: tx.patientId },
        select: { loyaltyPoints: true, tenantId: true }
      });

      if (!patient || patient.loyaltyPoints <= 0) continue;

      const pointsToExpire = Math.min(tx.points, patient.loyaltyPoints);

      await prisma.$transaction(async (p) => {
        await p.loyaltyTransaction.create({
          data: {
            tenantId: patient.tenantId,
            patientId: tx.patientId,
            type: 'EXPIRE',
            points: -pointsToExpire,
            referenceType: 'LOYALTY_TRANSACTION',
            referenceId: tx.id
          }
        });

        await p.patient.update({
          where: { id: tx.patientId },
          data: { loyaltyPoints: { decrement: pointsToExpire } }
        });
      });
    }
  }
}

export default new LoyaltyService();
