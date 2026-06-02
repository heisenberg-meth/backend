import prisma from '../../../config/prisma.js';

class AnomalyDetectionService {
  async detectAnomalies(tenantId) {
    const anomalies = [];

    const recentRefunds = await prisma.refundPayment.findMany({
      where: {
        invoice: { tenantId },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      include: { user: true }
    });

    const refundsByUser = {};
    recentRefunds.forEach(r => {
      const userId = r.createdBy;
      if (!refundsByUser[userId]) refundsByUser[userId] = { count: 0, total: 0, name: r.user?.fullName };
      refundsByUser[userId].count++;
      refundsByUser[userId].total += parseFloat(r.amount);
    });

    for (const [userId, stats] of Object.entries(refundsByUser)) {
      if (stats.count > 10) {
        anomalies.push({
          type: 'SUSPICIOUS_REFUND_VOLUME',
          userId,
          userName: stats.name,
          riskScore: 0.85,
          explanation: `${stats.name} processed ${stats.count} refunds in 7 days. Industry average is < 3.`
        });
      }
    }

    const stockAdjustments = await prisma.stockMovement.aggregate({
      where: {
        tenantId,
        movementType: 'ADJUSTMENT',
        quantity: { lt: 0 },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
      },
      _sum: { quantity: true }
    });

    const totalShrinkage = Math.abs(stockAdjustments._sum.quantity || 0);
    if (totalShrinkage > 500) {
      anomalies.push({
        type: 'INVENTORY_SHRINKAGE',
        riskScore: 0.92,
        explanation: `Lost ${totalShrinkage} units to "Adjustments" in 30 days. This indicates possible theft or massive process errors.`
      });
    }

    return {
      timestamp: new Date(),
      tenantId,
      anomalies,
      count: anomalies.length
    };
  }
}

export default new AnomalyDetectionService();
