import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class DeadStockService {
  /**
   * Analyzes slow moving (>60 days no sale) and dead stock (>120 days no sale)
   */
  async updateDeadStock(tenantId) {
    logger.info(`[DeadStockService] Analyzing slow/dead stock for tenant ${tenantId}`);

    const now = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(now.getDate() - 60);

    const oneTwentyDaysAgo = new Date();
    oneTwentyDaysAgo.setDate(now.getDate() - 120);

    const medicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        reorderLevel: true,
        inventoryBatches: {
          where: { status: 'ACTIVE', deletedAt: null, quantity: { gt: 0 } },
          select: { quantity: true, purchasePrice: true, expiryDate: true },
        },
        saleItems: {
          where: { sale: { status: 'COMPLETED' } },
          orderBy: { sale: { soldAt: 'desc' } },
          take: 1,
          select: { sale: { select: { soldAt: true } } },
        },
      },
    });

    for (const med of medicines) {
      const totalStock = med.inventoryBatches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalStock === 0) continue;

      const lastSaleDate = med.saleItems.length > 0 ? med.saleItems[0].sale.soldAt : null;
      let daysSinceLastSale = -1;

      if (lastSaleDate) {
        daysSinceLastSale = Math.floor((now - lastSaleDate) / (1000 * 60 * 60 * 24));
      } else {
        daysSinceLastSale = 999;
      }

      if (daysSinceLastSale > 60) {
        const turnoverRatio = 0;

        await prisma.slowMovingStock.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: null,
              medicineId: med.id,
            },
          },
          update: {
            daysSinceLastSale,
            currentStock: totalStock,
            turnoverRatio,
          },
          create: {
            tenantId,
            medicineId: med.id,
            daysSinceLastSale,
            currentStock: totalStock,
            turnoverRatio,
          },
        });
      } else {
        await prisma.slowMovingStock.deleteMany({
          where: { tenantId, medicineId: med.id },
        });
      }

      if (daysSinceLastSale > 120) {
        const stockValue = med.inventoryBatches.reduce(
          (sum, b) => sum + b.quantity * b.purchasePrice,
          0,
        );

        let expiryRiskScore = 0;
        for (const batch of med.inventoryBatches) {
          const daysToExpiry = Math.max(
            1,
            Math.floor((batch.expiryDate - now) / (1000 * 60 * 60 * 24)),
          );
          if (daysToExpiry < 90) {
            expiryRiskScore += (batch.quantity / daysToExpiry) * 10;
          }
        }
        expiryRiskScore = Math.min(100, Math.round(expiryRiskScore * 100) / 100);

        await prisma.deadStockAnalysis.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: null,
              medicineId: med.id,
            },
          },
          update: {
            currentStock: totalStock,
            stockValue,
            daysDead: daysSinceLastSale,
            expiryRiskScore,
          },
          create: {
            tenantId,
            medicineId: med.id,
            currentStock: totalStock,
            stockValue,
            daysDead: daysSinceLastSale,
            expiryRiskScore,
          },
        });
      } else {
        await prisma.deadStockAnalysis.deleteMany({
          where: { tenantId, medicineId: med.id },
        });
      }
    }

    logger.info(`[DeadStockService] Completed analysis for tenant ${tenantId}`);
  }
}

export default new DeadStockService();
