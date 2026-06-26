import configurationRepository from '../repositories/configuration.repository.js';
import forecastingService from '../../medicine-alerts/forecasting/forecasting.service.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import inventoryCalculationService from '../../inventory/service/inventory-calculation.service.js';
import prisma from '../../../config/prisma.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

const SCHEDULE_RESTRICTED = ['X', 'H1'];
const PRICE_CHANGE_APPROVAL_THRESHOLD = 0.2;

class ConfigurationService {
  async updateReorderPoint(medicineId, tenantId, data) {
    const { reorderPoint, safetyStock, maxStockLimit, branchId, updatedBy } = data;

    if (reorderPoint < 0 || safetyStock < 0) {
      throw new Error('Reorder point and safety stock cannot be negative');
    }

    if (maxStockLimit > 0 && reorderPoint >= maxStockLimit) {
      throw new Error('Reorder point must be below max stock limit');
    }

    const config = await configurationRepository.updateInventoryConfig(medicineId, tenantId, {
      branchId,
      reorderPoint,
      safetyStock,
      maxStockLimit,
      updatedBy,
    });

    await emitEvent('MEDICINE_REORDER_UPDATED', {
      medicineId,
      tenantId,
      branchId,
      reorderPoint,
      safetyStock,
      maxStockLimit,
    });

    await this._invalidateMedicineCache(tenantId, medicineId);

    return config;
  }

  async updatePricing(medicineId, tenantId, data) {
    const { mrp, sellingPrice, purchasePrice, changedBy } = data;

    if (sellingPrice > mrp) {
      throw new Error('Selling price cannot exceed MRP');
    }

    const marginPercent = ((sellingPrice - purchasePrice) / sellingPrice) * 100;
    if (marginPercent < 0) {
      throw new Error(
        `Negative margin (${marginPercent.toFixed(1)}%). Selling below cost requires MEDICINE_OVERRIDE_LOSS permission.`,
      );
    }

    const currentMedicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { sellingPrice: true },
    });

    const oldPrice = currentMedicine?.sellingPrice || 0;
    const priceChangeRatio = Math.abs(sellingPrice - oldPrice) / (oldPrice || 1);

    const needsApproval = oldPrice > 0 && priceChangeRatio > PRICE_CHANGE_APPROVAL_THRESHOLD;

    const history = await configurationRepository.updatePricing(medicineId, tenantId, {
      mrp,
      sellingPrice,
      purchasePrice,
      changedBy,
    });

    await emitEvent('MEDICINE_PRICE_UPDATED', {
      medicineId,
      tenantId,
      newPrice: sellingPrice,
      oldPrice,
      changeRatio: priceChangeRatio,
      needsApproval,
      marginPercent: parseFloat(marginPercent.toFixed(1)),
    });

    await this._invalidateMedicineCache(tenantId, medicineId);
    await this._invalidatePricingCache(tenantId, medicineId);

    return {
      history,
      meta: {
        marginPercent: parseFloat(marginPercent.toFixed(1)),
        priceChangePercent: parseFloat((priceChangeRatio * 100).toFixed(1)),
        needsApproval,
      },
    };
  }

  async updateStatus(medicineId, tenantId, data) {
    const { status, reason, changedBy } = data;

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: {
        status: true,
        scheduleType: true,
        prescriptionRequired: true,
        inventoryBatches: {
          where: {
            status: 'ACTIVE',
            quantity: { gt: 0 },
          },
          select: { quantity: true },
        },
      },
    });

    if (!medicine) {
      throw new Error('Medicine not found');
    }

    const newStatus = status;
    if (newStatus === 'INACTIVE' || newStatus === 'DISCONTINUED' || newStatus === 'BLOCKED') {
      const activeStock = inventoryCalculationService.calculateAvailableStock(
        medicine.inventoryBatches,
      );
      if (activeStock > 0) {
        logger.warn(
          { medicineId, tenantId, activeStock, newStatus },
          'Deactivating medicine with active stock — inventory will be quarantined',
        );
      }
    }

    if ((newStatus === 'RESTRICTED' || newStatus === 'BLOCKED') && medicine.scheduleType === 'X') {
      logger.info(
        { medicineId, tenantId, scheduleType: medicine.scheduleType },
        'Schedule X medicine restricted — full workflow lockdown applied',
      );
    }

    if (newStatus === 'ACTIVE' && SCHEDULE_RESTRICTED.includes(medicine.scheduleType || '')) {
      logger.info(
        { medicineId, tenantId, scheduleType: medicine.scheduleType },
        'Schedule restricted medicine activated — billing rules applied',
      );
    }

    const history = await configurationRepository.updateStatus(medicineId, tenantId, {
      status,
      reason,
      changedBy,
    });

    await emitEvent('MEDICINE_STATUS_CHANGED', {
      medicineId,
      tenantId,
      oldStatus: medicine.status,
      newStatus,
      scheduleType: medicine.scheduleType,
      reason,
      activeStock: inventoryCalculationService.calculateAvailableStock(medicine.inventoryBatches),
    });

    await this._invalidateMedicineCache(tenantId, medicineId);
    await this._invalidateSearchCache(tenantId);
    await this._invalidateBillingCache(tenantId, medicineId);

    return history;
  }

  async bulkUpdatePricing(tenantId, updates, userId) {
    const results = [];

    for (const update of updates) {
      try {
        const res = await this.updatePricing(update.medicineId, tenantId, {
          ...update,
          changedBy: userId,
        });
        results.push({ medicineId: update.medicineId, success: true, historyId: res.history.id });
      } catch (err) {
        logger.error({ err, medicineId: update.medicineId }, 'Bulk pricing update failed');
        results.push({ medicineId: update.medicineId, success: false, error: err.message });
      }
    }

    return results;
  }

  async getReorderAnalytics(medicineId, tenantId, branchId) {
    const [medicine, config, recommendations] = await Promise.all([
      prisma.medicine.findUnique({
        where: { id: medicineId },
        select: { name: true, reorderLevel: true },
      }),
      prisma.medicineInventoryConfig.findFirst({
        where: { medicineId, tenantId, branchId: branchId || null },
      }),
      forecastingService.getReorderRecommendations(medicineId, tenantId, branchId),
    ]);

    const safetyStock = config?.safetyStock || recommendations?.safetyStock || 0;
    const leadTime = recommendations?.leadTime || 7;
    const adu = recommendations?.averageDailyUsage || 0;

    const computedReorderPoint = adu > 0 ? Math.ceil(adu * leadTime + safetyStock) : null;

    return {
      medicineName: medicine?.name,
      currentReorderPoint: config?.reorderPoint || medicine?.reorderLevel,
      safetyStock,
      maxLimit: config?.maxStockLimit || 0,
      averageDailyUsage: adu,
      leadTimeDays: leadTime,
      computedReorderPoint,
      forecast: recommendations,
    };
  }

  async _invalidateMedicineCache(tenantId, medicineId) {
    try {
      const keys = await scanKeys(`medicine:${tenantId}:${medicineId}:*`);
      if (keys.length > 0) await redisClient.del(...keys);
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate medicine cache');
    }
  }

  async _invalidatePricingCache(tenantId, medicineId) {
    try {
      await redisClient.del(`pricing:${tenantId}:${medicineId}`);
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate pricing cache');
    }
  }

  async _invalidateSearchCache(tenantId) {
    try {
      const keys = await scanKeys(`search:${tenantId}:*`);
      if (keys.length > 0) await redisClient.del(...keys);
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate search cache');
    }
  }

  async _invalidateBillingCache(tenantId, medicineId) {
    try {
      await redisClient.del(`billing:${tenantId}:${medicineId}`);
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate billing cache');
    }
  }
}

export default new ConfigurationService();
