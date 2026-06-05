import prisma from '../../../config/prisma.js';

class ForecastingService {
  /**
   * Predict days remaining for a medicine based on average usage
   * Formula: Days Remaining = Current Stock / Average Daily Consumption
   */
  async predictDaysRemaining(medicineId, tenantId, branchId, currentStock, options = {}) {
    const { windowDays = 30 } = options;
    const adu = await this._calculateAverageDailyUsage(medicineId, tenantId, branchId, {
      windowDays,
    });

    if (adu <= 0) return 999;

    return Math.floor(currentStock / adu);
  }

  /**
   * Generate reorder recommendations based on ADU and Lead Time
   */
  async getReorderRecommendations(medicineId, tenantId, branchId, options = {}) {
    const { windowDays = 30 } = options;
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: {
        medicineSuppliers: {
          where: { isPreferred: true },
          take: 1,
        },
      },
    });

    if (!medicine) return null;

    const adu = await this._calculateAverageDailyUsage(medicineId, tenantId, branchId, {
      windowDays,
    });

    const leadTime = medicine.medicineSuppliers[0]?.leadDays || 7;
    const safetyStock = Math.ceil(adu * leadTime * 0.5);
    const recommendedQty = Math.ceil(adu * leadTime + safetyStock);

    return {
      medicineId,
      medicineName: medicine.name,
      averageDailyUsage: parseFloat(adu.toFixed(2)),
      leadTime,
      safetyStock,
      recommendedOrderQuantity: Math.max(medicine.reorderLevel || 10, recommendedQty),
      currentReorderLevel: medicine.reorderLevel,
      windowDays,
    };
  }

  /**
   * Generate DemandForecast records for a tenant's medicines
   */
  async generateDemandForecasts(tenantId, branchId, options = {}) {
    const { windowDays = 30, modelVersion = 'adu-v1' } = options;

    const medicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });

    const forecasts = [];
    for (const med of medicines) {
      const adu = await this._calculateAverageDailyUsage(med.id, tenantId, branchId, {
        windowDays,
      });
      if (adu <= 0) continue;

      const existing = await prisma.demandForecast.findFirst({
        where: {
          tenantId,
          medicineId: med.id,
          branchId: branchId || null,
          forecastDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      });

      const forecast = existing
        ? await prisma.demandForecast.update({
            where: { id: existing.id },
            data: {
              predictedQuantity: Math.ceil(adu * windowDays),
              confidenceScore: Math.min(0.95, adu > 10 ? 0.85 : 0.65),
              modelVersion,
            },
          })
        : await prisma.demandForecast.create({
            data: {
              tenantId,
              medicineId: med.id,
              branchId: branchId || null,
              forecastDate: new Date(),
              predictedQuantity: Math.ceil(adu * windowDays),
              confidenceScore: Math.min(0.95, adu > 10 ? 0.85 : 0.65),
              modelVersion,
            },
          });

      forecasts.push(forecast);
    }

    return forecasts;
  }

  /**
   * Calculate Average Daily Usage over a configurable window
   */
  async _calculateAverageDailyUsage(medicineId, tenantId, branchId, options = {}) {
    const { windowDays = 30 } = options;

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    const soldItems = await prisma.invoiceItem.aggregate({
      where: {
        medicineId,
        tenantId,
        invoice: {
          branchId: branchId || undefined,
          createdAt: { gte: windowStart },
          status: 'ACTIVE',
        },
      },
      _sum: { quantity: true },
    });

    const totalSold = soldItems._sum.quantity || 0;
    return totalSold / windowDays;
  }
}

export default new ForecastingService();
