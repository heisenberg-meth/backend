import prisma from '../../../config/prisma.js';

class DiscountEngineService {
  async generateDiscount(expiryRisk) {
    let discount = 0;

    if (expiryRisk.riskScore > 2.0) discount = 0.4;
    else if (expiryRisk.riskScore > 1.5) discount = 0.25;
    else if (expiryRisk.riskScore > 1.0) discount = 0.1;

    return await prisma.expiryDiscountRecommendation.create({
      data: {
        medicineId: expiryRisk.medicineId,
        batchId: expiryRisk.batchId,
        branchId: expiryRisk.branchId,
        suggestedDiscount: discount,
        expectedSellthrough: 0.95,
      },
    });
  }
}

export default new DiscountEngineService();
