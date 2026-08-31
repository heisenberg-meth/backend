import prisma from '../../../config/prisma.js';
import alertRepository from '../repositories/alert.repository.js';
import forecastingService from '../forecasting/forecasting.service.js';
import redisClient from '../../../config/redis.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

const ALERT_CACHE_TTL = 300;
const CRITICAL_DAYS_THRESHOLD = 15;
const WARNING_DAYS_THRESHOLD = 30;
const INFO_DAYS_THRESHOLD = 90;

class MedicineAlertService {
  async getLowStockAlerts(tenantId, options = {}) {
    const { branchId, severity, page = 1, limit = 50 } = options;

    const cacheKey = `alerts:low-stock:${tenantId}:${branchId || 'all'}:${severity || 'all'}:${page}:${limit}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const result = await alertRepository.findLowStockAlerts({
      tenantId,
      branchId,
      severity,
      page,
      limit,
    });

    const enriched = await Promise.all(
      result.alerts.map(async (alert) => {
        const daysRemaining = await forecastingService.predictDaysRemaining(
          alert.medicineId,
          tenantId,
          alert.branchId,
          alert.currentStock,
        );

        const reorderRec = await forecastingService.getReorderRecommendations(
          alert.medicineId,
          tenantId,
          alert.branchId,
        );

        return {
          ...alert,
          daysRemaining,
          recommendedOrderQuantity:
            reorderRec?.recommendedOrderQuantity || alert.medicine.reorderLevel * 2,
          averageDailyUsage: reorderRec?.averageDailyUsage || 0,
        };
      }),
    );

    const response = {
      alerts: enriched,
      pagination: result.pagination,
    };

    await this._setCache(cacheKey, response, ALERT_CACHE_TTL);

    return response;
  }

  async getExpiryAlerts(tenantId, options = {}) {
    const { branchId, severity, page = 1, limit = 50 } = options;

    const cacheKey = `alerts:expiry:${tenantId}:${branchId || 'all'}:${severity || 'all'}:${page}:${limit}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const result = await alertRepository.findExpiryAlerts({
      tenantId,
      branchId,
      severity,
      page,
      limit,
    });

    const enriched = result.alerts.map((alert) => {
      const potentialLoss = (alert.batch?.quantity || 0) * (alert.batch?.purchasePrice || 0);
      const severityLevel = this._calculateExpirySeverity(alert.daysRemaining);

      return {
        ...alert,
        severity: severityLevel,
        potentialLoss,
        expiryDate: alert.batch?.expiryDate,
        batchNumber: alert.batch?.batchNumber,
        stockQuantity: alert.batch?.quantity || 0,
      };
    });

    const response = {
      alerts: enriched,
      pagination: result.pagination,
    };

    await this._setCache(cacheKey, response, ALERT_CACHE_TTL);

    return response;
  }

  async getOutOfStockAlerts(tenantId, options = {}) {
    const { branchId, page = 1, limit = 50 } = options;

    const cacheKey = `alerts:out-of-stock:${tenantId}:${branchId || 'all'}:${page}:${limit}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const result = await alertRepository.findOutOfStockAlerts({
      tenantId,
      branchId,
      page,
      limit,
    });

    const enriched = await Promise.all(
      result.alerts.map(async (alert) => {
        const avgDailyDemand = await this._getAverageDailyDemand(
          alert.medicineId,
          tenantId,
          alert.branchId,
        );

        const priority = this._calculateOosPriority(alert.medicine, avgDailyDemand);

        return {
          ...alert,
          averageDailyDemand: avgDailyDemand,
          priority,
          lastAvailableAt: alert.lastAvailableAt,
        };
      }),
    );

    const response = {
      alerts: enriched,
      pagination: result.pagination,
    };

    await this._setCache(cacheKey, response, ALERT_CACHE_TTL);

    return response;
  }

  async getCriticalAlerts(tenantId, options = {}) {
    const { branchId } = options;

    const cacheKey = `alerts:critical:${tenantId}:${branchId || 'all'}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const [criticalStock, criticalExpiry] = await Promise.all([
      alertRepository.findLowStockAlerts({
        tenantId,
        branchId,
        severity: 'CRITICAL',
        page: 1,
        limit: 100,
      }),
      alertRepository.findExpiryAlerts({
        tenantId,
        branchId,
        severity: 'CRITICAL',
        page: 1,
        limit: 100,
      }),
    ]);

    const response = {
      stockAlerts: criticalStock.alerts,
      expiryAlerts: criticalExpiry.alerts,
      totalCritical: criticalStock.total + criticalExpiry.total,
    };

    await this._setCache(cacheKey, response, 60);

    return response;
  }

  async getExpirySummary(tenantId, options = {}) {
    const { branchId, daysThreshold = 90 } = options;

    const cacheKey = `alerts:expiry-summary:${tenantId}:${branchId || 'all'}:${daysThreshold}`;
    const cached = await this._getCache(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + daysThreshold);

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        branchId: branchId || undefined,
        expiryDate: { lte: thresholdDate, gt: now },
        quantity: { gt: 0 },
        status: { in: ['ACTIVE', 'NEAR_EXPIRY'] },
      },
      include: {
        medicine: {
          select: { name: true, genericName: true, sellingPrice: true },
        },
        branch: {
          select: { name: true, code: true },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const summary = {
      total: batches.length,
      bySeverity: { CRITICAL: 0, WARNING: 0, INFO: 0 },
      totalPotentialLoss: 0,
      batches: [],
    };

    batches.forEach((batch) => {
      const daysRemaining = Math.ceil(
        (batch.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );
      const severity = this._calculateExpirySeverity(daysRemaining);
      const potentialLoss = batch.quantity * batch.medicine.sellingPrice;

      summary.bySeverity[severity]++;
      summary.totalPotentialLoss += potentialLoss;

      summary.batches.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        medicineId: batch.medicineId,
        medicineName: batch.medicine.name,
        genericName: batch.medicine.genericName,
        branchName: batch.branch?.name,
        branchCode: batch.branch?.code,
        expiryDate: batch.expiryDate,
        daysRemaining,
        stockQuantity: batch.quantity,
        potentialLoss,
        severity,
        recommendedAction: this._getExpiryAction(daysRemaining, batch.quantity),
      });
    });

    await this._setCache(cacheKey, summary, ALERT_CACHE_TTL);

    return summary;
  }

  async getReorderRecommendations(tenantId, options = {}) {
    const { branchId, medicineId } = options;

    if (medicineId) {
      return forecastingService.getReorderRecommendations(medicineId, tenantId, branchId);
    }

    const lowStockAlerts = await alertRepository.findLowStockAlerts({
      tenantId,
      branchId,
      page: 1,
      limit: 100,
    });

    const recommendations = await Promise.all(
      lowStockAlerts.alerts.map((alert) =>
        forecastingService.getReorderRecommendations(alert.medicineId, tenantId, alert.branchId),
      ),
    );

    return recommendations.filter((r) => r !== null);
  }

  async getAlertTrends(tenantId, options = {}) {
    const { days = 30, branchId } = options;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [stockAlerts, expiryAlerts] = await Promise.all([
      prisma.stockAlert.groupBy({
        by: ['type', 'severity'],
        where: {
          tenantId,
          branchId: branchId || undefined,
          createdAt: { gte: since },
        },
        _count: true,
      }),
      prisma.expiryAlert.groupBy({
        by: ['severity'],
        where: {
          tenantId,
          branchId: branchId || undefined,
          createdAt: { gte: since },
        },
        _count: true,
      }),
    ]);

    const dailyAlerts = await prisma.stockAlert.groupBy({
      by: ['createdAt'],
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: since },
      },
      _count: true,
      orderBy: { createdAt: 'asc' },
    });

    return {
      stockAlertsByType: stockAlerts,
      stockAlertsBySeverity: stockAlerts,
      expiryAlertsBySeverity: expiryAlerts,
      dailyTrend: dailyAlerts,
      period: `${days} days`,
    };
  }

  async resolveAlert(alertId, tenantId, userId) {
    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.tenantId !== tenantId) {
      throw new Error('Alert not found');
    }

    const resolved = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });

    emitLocalEvent(DOMAIN_EVENTS.ALERT_RESOLVED, {
      alertId,
      tenantId,
      resolvedBy: userId,
      timestamp: new Date().toISOString(),
    });

    await this._invalidateCache(tenantId);

    return resolved;
  }

  async snoozeAlert(alertId, tenantId, snoozedUntil) {
    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert || alert.tenantId !== tenantId) {
      throw new Error('Alert not found');
    }

    return prisma.stockAlert.update({
      where: { id: alertId },
      data: { snoozedUntil },
    });
  }

  async triggerFullScan(tenantId) {
    const [expiryCount, stockCount] = await Promise.all([
      this._runExpiryScan(tenantId),
      this._runStockScan(tenantId),
    ]);

    emitLocalEvent(DOMAIN_EVENTS.ALERT_SCAN_COMPLETED, {
      tenantId,
      expiryAlerts: expiryCount,
      stockAlerts: stockCount,
      timestamp: new Date().toISOString(),
    });

    await this._invalidateCache(tenantId);

    return {
      expiryAlerts: expiryCount,
      stockAlerts: stockCount,
      total: expiryCount + stockCount,
    };
  }

  async _runExpiryScan(tenantId) {
    const now = new Date();
    const infoDate = new Date();
    infoDate.setDate(now.getDate() + INFO_DAYS_THRESHOLD);

    const expiringBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        expiryDate: { lte: infoDate },
        quantity: { gt: 0 },
        status: { in: ['ACTIVE', 'NEAR_EXPIRY'] },
      },
      include: { medicine: true },
    });

    let count = 0;

    for (const batch of expiringBatches) {
      const daysRemaining = Math.ceil(
        (batch.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
      );
      const severity = this._calculateExpirySeverity(daysRemaining);

      await alertRepository.upsertExpiryAlert({
        tenantId,
        branchId: batch.branchId,
        batchId: batch.id,
        medicineId: batch.medicineId,
        severity,
        daysRemaining,
        isResolved: false,
      });

      if (severity === 'CRITICAL') {
        emitLocalEvent(DOMAIN_EVENTS.EXPIRY_WARNING, {
          batchId: batch.id,
          medicineId: batch.medicineId,
          daysRemaining,
          tenantId,
          timestamp: new Date().toISOString(),
        });
      }

      count++;
    }

    return count;
  }

  async _runStockScan(tenantId) {
    const medicines = await prisma.medicine.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      select: { id: true, name: true, reorderLevel: true, prescriptionRequired: true },
    });

    let count = 0;

    for (const medicine of medicines) {
      const totalStock = await this._calculateTotalStock(medicine.id, null, tenantId);
      const threshold = medicine.reorderLevel || 10;

      if (totalStock <= threshold) {
        const severity =
          totalStock <= 0 ? 'CRITICAL' : medicine.prescriptionRequired ? 'CRITICAL' : 'WARNING';
        const alertType = totalStock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';

        await alertRepository.upsertStockAlert({
          tenantId,
          branchId: null,
          medicineId: medicine.id,
          type: alertType,
          severity,
          message: `${medicine.name}: ${totalStock} units (threshold: ${threshold})`,
          currentStock: totalStock,
          thresholdValue: threshold,
        });

        emitLocalEvent(
          alertType === 'OUT_OF_STOCK'
            ? DOMAIN_EVENTS.OUT_OF_STOCK_DETECTED
            : DOMAIN_EVENTS.LOW_STOCK_DETECTED,
          {
            medicineId: medicine.id,
            tenantId,
            totalStock,
            threshold,
            timestamp: new Date().toISOString(),
          },
        );

        count++;
      } else {
        await alertRepository.resolveStockAlerts(medicine.id, tenantId, null);
      }
    }

    return count;
  }

  async _calculateTotalStock(medicineId, branchId, tenantId) {
    const result = await prisma.inventoryBatch.aggregate({
      where: {
        medicineId,
        branchId: branchId || undefined,
        medicine: { tenantId },
        status: 'ACTIVE',
        expiryDate: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity || 0;
  }

  async _getAverageDailyDemand(medicineId, tenantId, branchId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sold = await prisma.invoiceItem.aggregate({
      where: {
        medicineId,
        invoice: {
          tenantId,
          branchId: branchId || undefined,
          createdAt: { gte: thirtyDaysAgo },
          status: 'ACTIVE',
        },
      },
      _sum: { quantity: true },
    });

    return (sold._sum.quantity || 0) / 30;
  }

  _calculateExpirySeverity(daysRemaining) {
    if (daysRemaining <= 0 || daysRemaining <= CRITICAL_DAYS_THRESHOLD) return 'CRITICAL';
    if (daysRemaining <= WARNING_DAYS_THRESHOLD) return 'WARNING';
    return 'INFO';
  }

  _calculateOosPriority(medicine, avgDailyDemand) {
    if (!medicine) return 'MEDIUM';

    if (medicine.prescriptionRequired) return 'CRITICAL';
    if (avgDailyDemand > 10) return 'HIGH';
    if (avgDailyDemand > 5) return 'MEDIUM';
    return 'LOW';
  }

  _getExpiryAction(daysRemaining, quantity) {
    if (daysRemaining <= 0) return 'DESTROY';
    if (daysRemaining <= 7) return 'EMERGENCY_DISCOUNT';
    if (daysRemaining <= 15) return 'DISCOUNT_CAMPAIGN';
    if (daysRemaining <= 30) return 'PROMOTE_SALES';
    if (quantity > 50) return 'SUPPLIER_RETURN';
    return 'MONITOR';
  }

  async _getCache(key) {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  async _setCache(key, data, ttl) {
    try {
      await redisClient.set(key, JSON.stringify(data), 'EX', ttl);
    } catch (error) {
      logger.error({ error, key }, '[MEDICINE-ALERT-SERVICE] Failed to set cache');
    }
  }

  async _invalidateCache(tenantId) {
    try {
      const keys = await scanKeys(`alerts:${tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      logger.error({ error, tenantId }, '[MEDICINE-ALERT-SERVICE] Failed to invalidate cache');
    }
  }
}

export default new MedicineAlertService();
