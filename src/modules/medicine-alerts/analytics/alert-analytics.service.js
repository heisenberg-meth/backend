import prisma from '../../../config/prisma.js';

class AlertAnalyticsService {
  async getMostFrequentlyExpiring(tenantId, options = {}) {
    const { days = 90, branchId, limit = 20 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    const expiringBatches = await prisma.expiryAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        isResolved: false,
        daysRemaining: { lte: days, gt: 0 },
      },
      include: {
        medicine: { select: { name: true, genericName: true } },
        batch: { select: { quantity: true, purchasePrice: true } },
      },
      orderBy: { daysRemaining: 'asc' },
    });

    const medicineMap = {};

    for (const alert of expiringBatches) {
      const mid = alert.medicineId;
      if (!medicineMap[mid]) {
        medicineMap[mid] = {
          medicineId: mid,
          medicineName: alert.medicine?.name,
          genericName: alert.medicine?.genericName,
          expiryCount: 0,
          totalQuantity: 0,
          totalPotentialLoss: 0,
          earliestExpiry: null,
        };
      }

      medicineMap[mid].expiryCount++;
      medicineMap[mid].totalQuantity += alert.batch?.quantity || 0;
      medicineMap[mid].totalPotentialLoss +=
        (alert.batch?.quantity || 0) * (alert.batch?.purchasePrice || 0);

      if (
        !medicineMap[mid].earliestExpiry ||
        alert.daysRemaining < medicineMap[mid].earliestExpiry
      ) {
        medicineMap[mid].earliestExpiry = alert.daysRemaining;
      }
    }

    return Object.values(medicineMap)
      .sort((a, b) => b.totalPotentialLoss - a.totalPotentialLoss)
      .slice(0, limit);
  }

  async getChronicStockOuts(tenantId, options = {}) {
    const { days = 30, branchId, limit = 20 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const outOfStockAlerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        type: 'OUT_OF_STOCK',
        createdAt: { gte: since },
      },
      include: {
        medicine: { select: { name: true, genericName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const medicineMap = {};

    for (const alert of outOfStockAlerts) {
      const key = `${alert.medicineId}-${alert.branchId || 'all'}`;
      if (!medicineMap[key]) {
        medicineMap[key] = {
          medicineId: alert.medicineId,
          medicineName: alert.medicine?.name,
          branchId: alert.branchId,
          outageCount: 0,
          firstOutage: alert.createdAt,
          lastOutage: alert.createdAt,
        };
      }

      medicineMap[key].outageCount++;
      if (alert.createdAt < medicineMap[key].firstOutage) {
        medicineMap[key].firstOutage = alert.createdAt;
      }
      if (alert.createdAt > medicineMap[key].lastOutage) {
        medicineMap[key].lastOutage = alert.createdAt;
      }
    }

    return Object.values(medicineMap)
      .sort((a, b) => b.outageCount - a.outageCount)
      .slice(0, limit);
  }

  async getSupplierExpiryIssues(tenantId, options = {}) {
    const { days = 90, limit = 20 } = options;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    const expiringBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        expiryDate: { lte: cutoffDate, gt: new Date() },
        quantity: { gt: 0 },
        status: { in: ['ACTIVE', 'NEAR_EXPIRY'] },
      },
      include: {
        medicine: { select: { name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    const supplierMap = {};

    for (const batch of expiringBatches) {
      const sid = batch.supplierId || 'unknown';
      if (!supplierMap[sid]) {
        supplierMap[sid] = {
          supplierId: sid,
          supplierName: batch.supplier?.name || 'Unknown',
          expiringBatchCount: 0,
          totalExpiringQuantity: 0,
          totalPotentialLoss: 0,
          avgShelfLifeDays: 0,
          totalShelfLifeDays: 0,
        };
      }

      supplierMap[sid].expiringBatchCount++;
      supplierMap[sid].totalExpiringQuantity += batch.quantity;

      const shelfLifeDays = Math.ceil(
        (batch.expiryDate.getTime() -
          (batch.manufacturingDate || new Date(batch.createdAt)).getTime()) /
          (1000 * 3600 * 24),
      );
      supplierMap[sid].totalShelfLifeDays += shelfLifeDays;
    }

    return Object.values(supplierMap)
      .map((s) => ({
        ...s,
        avgShelfLifeDays:
          s.expiringBatchCount > 0 ? Math.round(s.totalShelfLifeDays / s.expiringBatchCount) : 0,
      }))
      .sort((a, b) => b.expiringBatchCount - a.expiringBatchCount)
      .slice(0, limit);
  }

  async getAlertDashboard(tenantId, options = {}) {
    const { branchId } = options;

    const [lowStockCount, outOfStockCount, expiryCount, criticalCount] = await Promise.all([
      prisma.stockAlert.count({
        where: { tenantId, branchId: branchId || undefined, type: 'LOW_STOCK', isResolved: false },
      }),
      prisma.stockAlert.count({
        where: {
          tenantId,
          branchId: branchId || undefined,
          type: 'OUT_OF_STOCK',
          isResolved: false,
        },
      }),
      prisma.expiryAlert.count({
        where: { tenantId, branchId: branchId || undefined, isResolved: false },
      }),
      prisma.stockAlert.count({
        where: {
          tenantId,
          branchId: branchId || undefined,
          severity: 'CRITICAL',
          isResolved: false,
        },
      }),
    ]);

    const financialRisk = await prisma.expiryAlert.findMany({
      where: { tenantId, branchId: branchId || undefined, isResolved: false },
      include: { batch: { select: { quantity: true, purchasePrice: true } } },
    });

    const totalFinancialRisk = financialRisk.reduce(
      (sum, a) => sum + (a.batch?.quantity || 0) * (a.batch?.purchasePrice || 0),
      0,
    );

    return {
      summary: {
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        expiring: expiryCount,
        critical: criticalCount,
        totalActiveAlerts: lowStockCount + outOfStockCount + expiryCount,
      },
      financialRisk: {
        totalPotentialLoss: totalFinancialRisk,
        currency: 'INR',
      },
    };
  }

  async getAlertHeatmap(tenantId, options = {}) {
    const { days = 30, branchId } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: since },
      },
      select: { createdAt: true, type: true, severity: true, medicineId: true },
    });

    const heatmap = {};

    for (const alert of alerts) {
      const date = alert.createdAt.toISOString().split('T')[0];
      if (!heatmap[date]) {
        heatmap[date] = { LOW_STOCK: 0, OUT_OF_STOCK: 0, EXPIRING: 0, CRITICAL: 0 };
      }

      heatmap[date][alert.type] = (heatmap[date][alert.type] || 0) + 1;
      if (alert.severity === 'CRITICAL') {
        heatmap[date].CRITICAL++;
      }
    }

    return Object.entries(heatmap).map(([date, counts]) => ({ date, ...counts }));
  }
}

export default new AlertAnalyticsService();
