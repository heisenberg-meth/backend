import prisma from '../../../config/prisma.js';
import reorderService from './reorder.service.js';

class ExpiryRiskService {
  /**
   * Predict waste risk for specific batches
   * Formula: Remaining Stock / Predicted Consumption Before Expiry
   */
  async predictBatchRisk(batchId, tenantId) {
    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      include: { medicine: true }
    });

    if (!batch) throw new Error('Batch not found');

    // 1. Get consumption rate for this medicine
    const prediction = await reorderService.predictReorder(batch.medicineId, tenantId);
    const dailyDemand = prediction.avgDailyDemand;

    // 2. Calculate days until expiry
    const daysToExpiry = Math.max(0, (new Date(batch.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));

    // 3. Predicted consumption before expiry
    const predictedConsumption = dailyDemand * daysToExpiry;

    // 4. Calculate Risk Score (0.0 to 1.0)
    // If we have 100 units but will only sell 20, risk is high.
    let riskScore = 0;
    if (batch.availableQuantity > 0) {
      riskScore = Math.min(1.0, 1 - (predictedConsumption / batch.availableQuantity));
    }
    
    // Ensure riskScore is at least 0
    riskScore = Math.max(0, riskScore);

    // 5. Determine Recommended Action
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
