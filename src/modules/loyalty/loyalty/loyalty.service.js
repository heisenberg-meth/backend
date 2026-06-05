import loyaltyRepository from '../repositories/loyalty.repository.js';
import prisma from '../../../config/prisma.js';

class LoyaltyService {
  async getLoyaltyAccount(patientId, tenantId) {
    let account = await loyaltyRepository.findByPatientId(patientId, tenantId);

    if (!account) {
      // Lazy creation
      account = await loyaltyRepository.createAccount({
        tenantId,
        patientId,
      });
    }

    const history = await loyaltyRepository.getLoyaltyHistory(patientId, tenantId);

    return {
      ...account,
      history,
    };
  }

  async earnPoints(patientId, tenantId, amount, invoiceId, tx) {
    const points = Math.floor(amount / 100); // ₹100 = 1 point
    if (points <= 0) return;

    let account = await loyaltyRepository.findByPatientId(patientId, tenantId);
    if (!account) {
      account = await loyaltyRepository.createAccount({
        tenantId,
        patientId,
      });
    }

    const newAvailablePoints = account.availablePoints + points;
    const newLifetimePoints = account.lifetimePoints + points;

    await loyaltyRepository.updatePoints(
      patientId,
      tenantId,
      newAvailablePoints,
      newLifetimePoints,
      tx,
    );

    await loyaltyRepository.createTransaction(
      {
        tenantId,
        patientId: patientId,
        type: 'EARNED',
        points,
        referenceType: 'INVOICE',
        referenceId: invoiceId,
      },
      tx,
    );

    // Tier update logic could go here
    await this.updateTier(patientId, tenantId, newLifetimePoints, tx);
  }

  async redeemPoints(patientId, tenantId, points, tx) {
    const account = await loyaltyRepository.findByPatientId(patientId, tenantId);
    if (!account || account.availablePoints < points) {
      throw new Error('Insufficient loyalty points');
    }

    const newAvailablePoints = account.availablePoints - points;

    await loyaltyRepository.updatePoints(
      patientId,
      tenantId,
      newAvailablePoints,
      account.lifetimePoints,
      tx,
    );

    await loyaltyRepository.createTransaction(
      {
        tenantId,
        patientId: patientId,
        type: 'REDEEMED',
        points: -points,
      },
      tx,
    );

    return points / 10; // Example: 10 points = ₹1
  }

  async updateTier(patientId, tenantId, lifetimePoints, tx) {
    let tier = 'BRONZE';
    if (lifetimePoints >= 10000) tier = 'PLATINUM';
    else if (lifetimePoints >= 5000) tier = 'GOLD';
    else if (lifetimePoints >= 1000) tier = 'SILVER';

    const client = tx || prisma;
    await client.patientLoyaltyAccount.update({
      where: { patientId, tenantId },
      data: { loyaltyTier: tier },
    });
  }
}

export default new LoyaltyService();
