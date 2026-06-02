import prisma from '../../../config/prisma.js';

class ExpiryAIService {
  async analyzeExpiryRisks(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000) },
      },
      include: { medicine: true },
    });

    for (const batch of batches) {
      const forecast = await prisma.demandForecast.findFirst({
        where: { medicineId: batch.medicineId, branchId: batch.branchId },
        orderBy: { forecastDate: 'desc' },
      });

      const predictedSales = forecast ? forecast.predictedQuantity : 0;

      const riskScore = predictedSales > 0 ? batch.quantity / Number(predictedSales) : 2.0;

      if (riskScore > 1.0) {
        await prisma.expiryRiskPrediction.create({
          data: {
            tenantId,
            medicineId: batch.medicineId,
            batchId: batch.id,
            branchId: batch.branchId,
            riskScore: riskScore,
            predictedUnsoldQty: Math.max(0, batch.quantity - Number(predictedSales)),
            recommendation: this.getRecommendation(riskScore),
          },
        });
      }
    }
  }

  getRecommendation(score) {
    if (score > 1.5) return 'IMMEDIATE_REDISTRIBUTION_OR_DISCOUNT';
    return 'MONITOR_AND_DISCOUNT';
  }
}

export default new ExpiryAIService();
