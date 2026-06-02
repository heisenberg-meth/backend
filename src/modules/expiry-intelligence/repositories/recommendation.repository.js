import prisma from '../../../config/prisma.js';

class RecommendationRepository {
  async upsertRecommendation(data) {
    return prisma.expiryRecommendation.create({
      data,
    });
  }

  async clearRecommendations(tenantId) {
    return prisma.expiryRecommendation.deleteMany({
      where: { tenantId },
    });
  }

  async getRecommendations(tenantId) {
    return prisma.expiryRecommendation.findMany({
      where: { tenantId },
      include: {
        batch: { include: { medicine: true, supplier: true } },
      },
      orderBy: { priorityScore: 'desc' },
    });
  }
}

export default new RecommendationRepository();
