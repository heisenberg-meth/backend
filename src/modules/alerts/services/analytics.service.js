import prisma from '../../../config/prisma.js';

class AlertAnalyticsService {
  async getAlertSummary(tenantId, options = {}) {
    const { branchId, days = 30 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [activeAlerts, resolvedAlerts, escalatedAlerts, snoozedAlerts] = await Promise.all([
      prisma.stockAlert.count({
        where: {
          tenantId,
          branchId: branchId || undefined,
          alertStatus: 'ACTIVE',
          isResolved: false,
        },
      }),
      prisma.stockAlert.count({
        where: {
          tenantId,
          branchId: branchId || undefined,
          isResolved: true,
          resolvedAt: { gte: since },
        },
      }),
      prisma.stockAlert.count({
        where: { tenantId, branchId: branchId || undefined, alertStatus: 'ESCALATED' },
      }),
      prisma.stockAlert.count({
        where: { tenantId, branchId: branchId || undefined, alertStatus: 'SNOOZED' },
      }),
    ]);

    const expiryAlerts = await prisma.expiryAlert.count({
      where: { tenantId, branchId: branchId || undefined, isResolved: false },
    });

    const financialRisk = await prisma.expiryAlert.findMany({
      where: { tenantId, branchId: branchId || undefined, isResolved: false },
      select: { potentialLoss: true },
    });

    const totalFinancialRisk = financialRisk.reduce((sum, a) => sum + (a.potentialLoss || 0), 0);

    return {
      active: activeAlerts,
      resolved: resolvedAlerts,
      escalated: escalatedAlerts,
      snoozed: snoozedAlerts,
      expiring: expiryAlerts,
      totalActive: activeAlerts + expiryAlerts,
      financialRisk: {
        totalPotentialLoss: totalFinancialRisk,
        currency: 'INR',
      },
    };
  }

  async getAlertTrends(tenantId, options = {}) {
    const { days = 30, branchId } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: since },
      },
      select: { createdAt: true, type: true, severity: true, alertStatus: true },
    });

    const dailyTrends = {};

    for (const alert of alerts) {
      const date = alert.createdAt.toISOString().split('T')[0];
      if (!dailyTrends[date]) {
        dailyTrends[date] = {
          LOW_STOCK: 0,
          OUT_OF_STOCK: 0,
          EXPIRING: 0,
          EXPIRED: 0,
          CRITICAL: 0,
          resolved: 0,
        };
      }

      dailyTrends[date][alert.type] = (dailyTrends[date][alert.type] || 0) + 1;
      if (alert.severity === 'CRITICAL') dailyTrends[date].CRITICAL++;
      if (alert.alertStatus === 'RESOLVED') dailyTrends[date].resolved++;
    }

    return Object.entries(dailyTrends)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getMostAlertedMedicines(tenantId, options = {}) {
    const { days = 30, branchId, limit = 20 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: since },
      },
      include: {
        medicine: { select: { name: true, genericName: true } },
      },
    });

    const medicineMap = {};

    for (const alert of alerts) {
      const mid = alert.medicineId;
      if (!medicineMap[mid]) {
        medicineMap[mid] = {
          medicineId: mid,
          medicineName: alert.medicine?.name,
          genericName: alert.medicine?.genericName,
          alertCount: 0,
          criticalCount: 0,
          types: {},
        };
      }

      medicineMap[mid].alertCount++;
      if (alert.severity === 'CRITICAL') medicineMap[mid].criticalCount++;
      medicineMap[mid].types[alert.type] = (medicineMap[mid].types[alert.type] || 0) + 1;
    }

    return Object.values(medicineMap)
      .sort((a, b) => b.alertCount - a.alertCount)
      .slice(0, limit);
  }

  async getEscalationReport(tenantId, options = {}) {
    const { days = 30 } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const escalatedAlerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        escalatedAt: { gte: since },
      },
      include: {
        medicine: { select: { name: true, prescriptionRequired: true } },
      },
      orderBy: { escalationCount: 'desc' },
    });

    return {
      totalEscalations: escalatedAlerts.length,
      alerts: escalatedAlerts.map((a) => ({
        alertId: a.id,
        medicineName: a.medicine?.name,
        severity: a.severity,
        escalationCount: a.escalationCount,
        escalatedAt: a.escalatedAt,
        isLifeSaving: a.medicine?.prescriptionRequired,
      })),
    };
  }
}

export default new AlertAnalyticsService();
