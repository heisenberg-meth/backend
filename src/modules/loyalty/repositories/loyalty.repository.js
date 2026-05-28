import prisma from '../../../config/prisma.js';

class LoyaltyRepository {
  async findByPatientId(patientId, tenantId) {
    return prisma.patientLoyaltyAccount.findUnique({
      where: { patientId, tenantId },
      include: {
        patient: {
          select: {
            fullName: true,
            loyaltyPoints: true,
          }
        }
      }
    });
  }

  async createAccount(data) {
    return prisma.patientLoyaltyAccount.create({
      data,
    });
  }

  async updatePoints(patientId, tenantId, availablePoints, lifetimePoints, tx) {
    const client = tx || prisma;
    return client.patientLoyaltyAccount.update({
      where: { patientId, tenantId },
      data: {
        availablePoints,
        lifetimePoints,
      }
    });
  }

  async getLoyaltyHistory(patientId, tenantId) {
    return prisma.loyaltyTransaction.findMany({
      where: { patientId: patientId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  }

  async createTransaction(data, tx) {
    const client = tx || prisma;
    return client.loyaltyTransaction.create({
      data,
    });
  }
}

export default new LoyaltyRepository();
