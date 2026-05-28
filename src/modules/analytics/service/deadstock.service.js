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

    // Get all medicines with current stock
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
      if (totalStock === 0) continue; // Not slow/dead if we don't have it

      const lastSaleDate = med.saleItems.length > 0 ? med.saleItems[0].sale.soldAt : null;
      let daysSinceLastSale = -1;
      
      if (lastSaleDate) {
        daysSinceLastSale = Math.floor((now - lastSaleDate) / (1000 * 60 * 60 * 24));
      } else {
        // If never sold, calculate from earliest batch creation date or just set a high number
        daysSinceLastSale = 999; 
      }

      // SLOW MOVING: > 60 days
      if (daysSinceLastSale > 60) {
        const turnoverRatio = 0; // Turnover = Units Sold / Avg Inventory (0 if no sales)

        await prisma.slowMovingStock.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: null,
              medicineId: med.id
            }
          },
          update: {
            daysSinceLastSale,
            currentStock: totalStock,
            turnoverRatio
          },
          create: {
            tenantId,
            medicineId: med.id,
            daysSinceLastSale,
            currentStock: totalStock,
            turnoverRatio
          }
        });
      } else {
         // Clean up if it's no longer slow moving
         await prisma.slowMovingStock.deleteMany({
           where: { tenantId, medicineId: med.id }
         });
      }

      // DEAD STOCK: > 120 days
      if (daysSinceLastSale > 120) {
        const stockValue = med.inventoryBatches.reduce((sum, b) => sum + (b.quantity * b.purchasePrice), 0);
        
        // Calculate Expiry Risk Score
        // Higher score if near expiry and large quantity
        let expiryRiskScore = 0;
        for (const batch of med.inventoryBatches) {
          const daysToExpiry = Math.max(1, Math.floor((batch.expiryDate - now) / (1000 * 60 * 60 * 24)));
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
              medicineId: med.id
            }
          },
          update: {
            currentStock: totalStock,
            stockValue,
            daysDead: daysSinceLastSale,
            expiryRiskScore
          },
          create: {
            tenantId,
            medicineId: med.id,
            currentStock: totalStock,
            stockValue,
            daysDead: daysSinceLastSale,
            expiryRiskScore
          }
        });
      } else {
        await prisma.deadStockAnalysis.deleteMany({
          where: { tenantId, medicineId: med.id }
        });
      }
    }
    
    logger.info(`[DeadStockService] Completed analysis for tenant ${tenantId}`);
  }
}

export default new DeadStockService();
