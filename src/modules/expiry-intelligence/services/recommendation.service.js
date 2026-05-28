import recommendationRepository from '../repositories/recommendation.repository.js';
import batchRepository from '../repositories/batch.repository.js';

class RecommendationService {
  /**
   * Generate suggestions to reduce expiry loss
   */
  async generateRecommendations(tenantId) {
    // 1. Clear old ones
    await recommendationRepository.clearRecommendations(tenantId);

    // 2. Get near-expiry batches
    const batches = await batchRepository.getNearExpiry(tenantId, 90);
    const now = new Date();

    const recommendations = [];
    for (const batch of batches) {
      const diffTime = batch.expiryDate - now;
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1; // Avoid div by zero

      // Priority Score = Qty / Days Remaining
      // High Qty + Soon Expiry = High Priority
      const priorityScore = batch.quantity / daysRemaining;

      let type = 'PROMOTE';
      let message = `Promote Batch ${batch.batchNumber} - expires in ${daysRemaining} days.`;

      if (daysRemaining <= 30) {
        type = 'DISCOUNT';
        message = `Apply 20% discount to Batch ${batch.batchNumber} to clear stock.`;
      } else if (daysRemaining > 60 && batch.quantity > 50) {
        type = 'RETURN';
        message = `Consider returning excess stock of Batch ${batch.batchNumber} to supplier.`;
      }

      const rec = await recommendationRepository.upsertRecommendation({
        tenantId,
        batchId: batch.id,
        type,
        priorityScore,
        message,
      });

      recommendations.push(rec);
    }

    return recommendations;
  }

  async getRecommendations(tenantId) {
    return recommendationRepository.getRecommendations(tenantId);
  }
}

export default new RecommendationService();
