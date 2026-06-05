import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class BehaviorService {
  async analyzeBehavior(tenantId, patientId) {
    logger.info(
      `[BehaviorService] Analyzing behavior for patient ${patientId} in tenant ${tenantId}`,
    );

    const sales = await prisma.sale.findMany({
      where: { tenantId, patientId, status: 'COMPLETED' },
      orderBy: { soldAt: 'asc' },
      include: {
        items: {
          select: { medicineId: true, quantity: true, totalAmount: true },
        },
      },
    });

    if (sales.length === 0) return;

    const medicineHistory = {};

    for (const sale of sales) {
      for (const item of sale.items) {
        if (!medicineHistory[item.medicineId]) {
          medicineHistory[item.medicineId] = [];
        }
        medicineHistory[item.medicineId].push({
          date: new Date(sale.soldAt),
          quantity: item.quantity,
          amount: item.totalAmount,
        });
      }
    }

    for (const [medicineId, history] of Object.entries(medicineHistory)) {
      const frequency = history.length;
      let totalSpent = 0;
      let totalIntervalDays = 0;
      const lastPurchaseDate = history[history.length - 1].date;

      for (let i = 0; i < history.length; i++) {
        totalSpent += history[i].amount;
        if (i > 0) {
          const diffTime = Math.abs(history[i].date - history[i - 1].date);
          totalIntervalDays += Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }

      const averagePurchaseInterval =
        frequency > 1 ? Math.round(totalIntervalDays / (frequency - 1)) : 0;

      let adherenceScore = 0;
      if (frequency > 2 && averagePurchaseInterval > 0) {
        const daysSinceLast = Math.ceil(
          Math.abs(new Date() - lastPurchaseDate) / (1000 * 60 * 60 * 24),
        );
        const deviation = Math.abs(daysSinceLast - averagePurchaseInterval);
        const adherencePct = Math.max(0, 100 - deviation * (100 / averagePurchaseInterval));
        adherenceScore = Math.round(adherencePct * 100) / 100;
      }

      await prisma.patientBehavior.upsert({
        where: {
          tenantId_patientId_medicineId: {
            tenantId,
            patientId,
            medicineId,
          },
        },
        update: {
          purchaseFrequency: frequency,
          averagePurchaseInterval,
          totalSpent,
          lastPurchaseDate,
          adherenceScore,
        },
        create: {
          tenantId,
          patientId,
          medicineId,
          purchaseFrequency: frequency,
          averagePurchaseInterval,
          totalSpent,
          lastPurchaseDate,
          adherenceScore,
        },
      });
    }

    logger.info(`[BehaviorService] Processed behavior for patient ${patientId}`);
  }

  async runTenantAnalysis(tenantId) {
    logger.info(`[BehaviorService] Running tenant-wide analysis for tenant ${tenantId}`);

    const patients = await prisma.patient.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });

    for (const patient of patients) {
      await this.analyzeBehavior(tenantId, patient.id);
    }
  }
}

export default new BehaviorService();
