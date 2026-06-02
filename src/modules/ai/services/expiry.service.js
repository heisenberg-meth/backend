import prisma from '../../../config/prisma.js';
import reorderService from './reorder.service.js';

class ExpiryRiskService {
  async predictBatchRisk(batchId, tenantId) {
    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: { medicine: true },
    });

    if (!batch) throw new Error('Batch not found');

    const prediction = await reorderService.predictReorder(batch.medicineId, tenantId);
    const dailyDemand = prediction.avgDailyDemand;

    const daysToExpiry = Math.max(
      0,
      (new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24),
    );

    const predictedConsumption = dailyDemand * daysToExpiry;

    let riskScore = 0;
    if (batch.availableQuantity > 0) {
      riskScore = Math.min(1.0, 1 - predictedConsumption / batch.availableQuantity);
    }

    riskScore = Math.max(0, riskScore);

    let action = 'MONITOR';
    if (riskScore > 0.8 && daysToExpiry < 90) action = 'LIQUIDATE';
    else if (riskScore > 0.5) action = 'DISCOUNT';
    else if (daysToExpiry < 30) action = 'QUARANTINE_SOON';

    return {
      batchId,
      batchNumber: batch.batchNumber,
      medicineName: batch.medicine.name,
      expiryDate: batch.expiryDate,
      remainingStock: batch.availableQuantity,
      daysToExpiry: Math.floor(daysToExpiry),
      predictedConsumption: Math.floor(predictedConsumption),
      expiryRisk: parseFloat(riskScore.toFixed(2)),
      recommendedAction: action,
    };
  }
}

export default new ExpiryRiskService();
