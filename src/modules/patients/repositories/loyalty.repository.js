import prisma from '../../../config/prisma.js';

class LoyaltyRepository {
  async createTransaction(data, tx) {
    const client = tx || prisma;
    return client.loyaltyTransaction.create({
      data,
    });
  }

  async findByCustomerId(patientId, tenantId) {
    return prisma.loyaltyTransaction.findMany({
      where: { patientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new LoyaltyRepository();
