import prisma from '../../../../config/prisma.js';

class AnalyticsService {
  async getValuation(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: { tenantId, deletedAt: null },
      include: { medicine: true },
    });

    let totalInventoryValue = 0;
    const batchExposure = [];

    batches.forEach((batch) => {
      const value = batch.availableQuantity * (batch.purchasePrice || 0);
      totalInventoryValue += value;
      batchExposure.push({ medicine: batch.medicine.name, value });
    });

    return { totalInventoryValue, batchExposure };
  }

  async getTurnover() {
    return {
      inventoryTurnoverRate: 6.4,
      fastMoving: ['Paracetamol'],
      slowMoving: ['Rare Antibiotic'],
    };
  }

  async getNearExpiry(tenantId, days) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: expiryDate, gte: new Date() },
        availableQuantity: { gt: 0 },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { medicine: true },
    });

    return {
      nearExpiry: batches.map((b) => ({
        medicine: b.medicine.name,
        batchNo: b.batchNumber,
        daysRemaining: Math.floor((b.expiryDate - new Date()) / (1000 * 60 * 60 * 24)),
      })),
    };
  }

  async getDeadStock() {
    // Placeholder: Need logic to check sales activity over last 180 days
    return {
      deadStock: [{ medicine: 'Old Antibiotic', daysUnsold: 180 }],
    };
  }
}

export default new AnalyticsService();
