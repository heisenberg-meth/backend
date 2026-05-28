import prisma from '../../../config/prisma.js';

class ExpiryAIService {
  /**
   * Run nightly analysis to score expiry risks for all active batches
   */
  async analyzeExpiryRisks(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: { 
        status: 'ACTIVE',
        expiryDate: { lte: new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000) } // 90 days
      },
      include: { medicine: true }
    });

    for (const batch of batches) {
      // 1. Get predicted demand
      const forecast = await prisma.demandForecast.findFirst({
        where: { medicineId: batch.medicineId, branchId: batch.branchId },
        orderBy: { forecastDate: 'desc' }
      });

      const predictedSales = forecast ? forecast.predictedQuantity : 0;
      
      // 2. Compute Risk Score: Current Qty / Predicted Sales (as a proxy)
      const riskScore = predictedSales > 0 ? (batch.quantity / Number(predictedSales)) : 2.0;

      // 3. Persist Risk
      if (riskScore > 1.0) {
        await prisma.expiryRiskPrediction.create({
          data: {
            tenantId,
            medicineId: batch.medicineId,
            batchId: batch.id,
            branchId: batch.branchId,
            riskScore: riskScore,
            predictedUnsoldQty: Math.max(0, batch.quantity - Number(predictedSales)),
            recommendation: this.getRecommendation(riskScore)
          }
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
