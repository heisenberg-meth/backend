import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import alertSettingsService from '../../alert-settings/services/alert-settings.service.js';

const SEVERITY_CACHE_TTL = 3600;

class AlertSeverityEngine {
  calculateStockSeverity(daysRemaining = null, thresholds = null) {
    const crit = thresholds?.criticalStock ?? 3;
    const warn = thresholds?.lowStock ?? 7;

    if (daysRemaining <= 0) return 'CRITICAL';
    if (daysRemaining < crit) return 'CRITICAL';
    if (daysRemaining <= warn) return 'HIGH';
    if (daysRemaining <= 15) return 'MEDIUM';
    return 'LOW';
  }

  calculateExpirySeverity(daysRemaining, thresholds = null) {
    const crit = thresholds?.criticalExpiry ?? 15;
    const warn = thresholds?.expiryWarning ?? 30;

    if (daysRemaining <= 0) return 'CRITICAL';
    if (daysRemaining <= crit) return 'CRITICAL';
    if (daysRemaining <= warn) return 'WARNING';
    return 'INFO';
  }

  async calculatePredictiveSeverity(medicineId, tenantId, branchId, currentStock) {
    const thresholds = await alertSettingsService.getEffectiveThresholds(
      tenantId,
      medicineId,
      branchId,
    );
    const adu = await this._getAverageDailyUsage(medicineId, tenantId, branchId);
    const daysRemaining = adu > 0 ? Math.floor(currentStock / adu) : 999;

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: {
        prescriptionRequired: true,
        scheduleType: true,
        categoryId: true,
      },
    });

    let baseSeverity = this.calculateStockSeverity(daysRemaining, thresholds);

    if (medicine?.prescriptionRequired && baseSeverity !== 'CRITICAL') {
      baseSeverity = this._escalateSeverity(baseSeverity);
    }

    if (medicine?.scheduleType === 'H1' && baseSeverity !== 'CRITICAL') {
      baseSeverity = this._escalateSeverity(baseSeverity);
    }

    const lifeSavingCrit = thresholds.criticalStock || 3;
    if (daysRemaining <= lifeSavingCrit && medicine?.prescriptionRequired) {
      baseSeverity = 'CRITICAL';
    }

    return {
      severity: baseSeverity,
      daysRemaining,
      averageDailyUsage: parseFloat(adu.toFixed(2)),
      isLifeSaving: medicine?.prescriptionRequired || false,
      thresholds,
    };
  }

  async calculateExpiryRiskValue(batchId, tenantId = null) {
    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: {
        quantity: true,
        purchasePrice: true,
        expiryDate: true,
        medicineId: true,
        tenantId: true,
      },
    });

    if (!batch) return null;

    const effectiveTenantId = tenantId || batch.tenantId;
    const thresholds = await alertSettingsService.getEffectiveThresholds(
      effectiveTenantId,
      batch.medicineId,
    );

    const riskValue = batch.quantity * batch.purchasePrice;
    const daysRemaining = Math.ceil((batch.expiryDate.getTime() - Date.now()) / (1000 * 3600 * 24));

    return {
      batchId,
      riskValue,
      daysRemaining,
      severity: this.calculateExpirySeverity(daysRemaining, thresholds),
      quantity: batch.quantity,
      unitCost: batch.purchasePrice,
    };
  }

  _escalateSeverity(current) {
    const escalationMap = {
      LOW: 'MEDIUM',
      MEDIUM: 'HIGH',
      HIGH: 'CRITICAL',
      CRITICAL: 'CRITICAL',
      INFO: 'WARNING',
      WARNING: 'CRITICAL',
    };
    return escalationMap[current] || current;
  }

  async _getAverageDailyUsage(medicineId, tenantId, branchId) {
    const cacheKey = `severity:adu:${tenantId}:${medicineId}:${branchId || 'all'}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return parseFloat(cached);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.invoiceItem.aggregate({
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

    const adu = (result._sum.quantity || 0) / 30;

    await redisClient.set(cacheKey, adu.toString(), 'EX', SEVERITY_CACHE_TTL);

    return adu;
  }
}

export default new AlertSeverityEngine();
