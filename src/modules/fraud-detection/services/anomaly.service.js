import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AnomalyService {
  /**
   * Monitor for suspicious sales behavior
   */
  async detectSalesAnomaly(tenantId, transaction) {
    // Heuristic: Check for high-value outliers
    const avgSales = await this.getAverageSales(tenantId);
    if (transaction.totalAmount > avgSales * 5) {
      await prisma.salesAnomaly.create({
        data: {
          tenantId,
          transactionId: transaction.id,
          anomalyType: 'HIGH_VALUE_OUTLIER',
          riskScore: 0.85
        }
      });
      logger.warn(
        { transactionId: transaction.id },
        '[ANOMALY_SERVICE] High-value outlier detected',
      );
    }
  }

  async getAverageSales(tenantId) {
    const stats = await prisma.sale.aggregate({
      where: { tenantId },
      _avg: { totalAmount: true }
    });
    return stats._avg.totalAmount || 0;
  }
}

export default new AnomalyService();
