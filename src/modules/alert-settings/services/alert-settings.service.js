import repo from '../repositories/alert-settings.repository.js';
import auditService from '../../audit/service/audit.service.js';
import logger from '../../../shared/utils/logger.js';
import redisClient from '../../../config/redis.js';

const DEFAULT_SETTINGS = {
  lowStockThreshold: 20,
  criticalStockThreshold: 5,
  expiryWarningDays: 30,
  criticalExpiryDays: 7,
  autoRaisePO: false,
  escalationHours: 24,
};

class AlertSettingsService {
  async getSettings(tenantId, branchId = null) {
    let settings = await repo.getByTenantAndBranch(tenantId, branchId);

    if (!settings) {
      // Create with defaults if not found
      settings = await repo.upsert(tenantId, DEFAULT_SETTINGS, branchId);
    }

    return settings;
  }

  async updateSettings(tenantId, data, updatedBy = null, branchId = null) {
    this._validateThresholds(data);

    const oldSettings = await repo.getByTenantAndBranch(tenantId, branchId);

    const settings = await repo.upsert(tenantId, {
      ...data,
      updatedBy,
    }, branchId);

    // Audit logging
    await auditService.logAction({
      tenantId,
      userId: updatedBy,
      entityType: 'ALERT_SETTINGS',
      entityId: settings.id,
      action: 'UPDATE',
      previousData: oldSettings,
      newData: settings,
    });

    // Invalidate cache
    await this._invalidateCache(tenantId, branchId);

    logger.info({ tenantId, branchId, updatedBy }, 'Alert settings updated');

    return settings;
  }

  async createOverride(tenantId, alertSettingsId, data) {
    const existing = await repo.getOverrideByMedicine(tenantId, alertSettingsId, data.medicineId);
    if (existing) {
      throw new Error('Override already exists for this medicine');
    }

    const override = await repo.createOverride(tenantId, alertSettingsId, data);

    await this._invalidateCache(tenantId);

    return override;
  }

  async updateOverride(tenantId, overrideId, data) {
    const override = await repo.updateOverride(tenantId, overrideId, data);
    await this._invalidateCache(tenantId);
    return override;
  }

  async deleteOverride(tenantId, overrideId) {
    await repo.deleteOverride(tenantId, overrideId);
    await this._invalidateCache(tenantId);
  }

  async getOverrides(tenantId, alertSettingsId) {
    return repo.getOverrides(tenantId, alertSettingsId);
  }

  async getEffectiveThresholds(tenantId, medicineId, branchId = null) {
    const cacheKey = `alert:thresholds:${tenantId}:${branchId || 'global'}:${medicineId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.error({ err }, 'Alert settings cache retrieval failed');
    }

    const settings = await this.getSettings(tenantId, branchId);
    const override = await repo.getOverrideByMedicine(tenantId, settings.id, medicineId);

    const thresholds = {
      lowStock: override?.lowStockThreshold ?? settings.lowStockThreshold,
      criticalStock: override?.criticalStockThreshold ?? settings.criticalStockThreshold,
      expiryWarning: override?.expiryWarningDays ?? settings.expiryWarningDays,
      criticalExpiry: override?.criticalExpiryDays ?? settings.criticalExpiryDays,
      autoRaisePO: settings.autoRaisePO,
      escalationHours: settings.escalationHours,
    };

    try {
      await redisClient.set(cacheKey, JSON.stringify(thresholds), 'EX', 3600);
    } catch (err) {
      logger.error({ err }, 'Alert settings cache storage failed');
    }

    return thresholds;
  }

  async testAlertRules(tenantId, { medicineId, currentStock, expiryDate, branchId = null }) {
    const settings = await this.getSettings(tenantId, branchId);
    const override = await repo.getOverrideByMedicine(tenantId, settings.id, medicineId);

    const thresholds = {
      lowStock: override?.lowStockThreshold ?? settings.lowStockThreshold,
      criticalStock: override?.criticalStockThreshold ?? settings.criticalStockThreshold,
      expiryWarning: override?.expiryWarningDays ?? settings.expiryWarningDays,
      criticalExpiry: override?.criticalExpiryDays ?? settings.criticalExpiryDays,
    };

    const daysToExpiry = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24));

    const results = {
      thresholds,
      daysToExpiry,
      alerts: [],
    };

    if (currentStock <= thresholds.criticalStock) {
      results.alerts.push({ type: 'CRITICAL_STOCK', severity: 'CRITICAL', message: `Stock level (${currentStock}) is at or below critical threshold (${thresholds.criticalStock})` });
    } else if (currentStock <= thresholds.lowStock) {
      results.alerts.push({ type: 'LOW_STOCK', severity: 'WARNING', message: `Stock level (${currentStock}) is at or below low stock threshold (${thresholds.lowStock})` });
    }

    if (daysToExpiry <= thresholds.criticalExpiry) {
      results.alerts.push({ type: 'CRITICAL_EXPIRY', severity: 'CRITICAL', message: `Medicine expires in ${daysToExpiry} days (critical threshold: ${thresholds.criticalExpiry})` });
    } else if (daysToExpiry <= thresholds.expiryWarning) {
      results.alerts.push({ type: 'NEAR_EXPIRY', severity: 'WARNING', message: `Medicine expires in ${daysToExpiry} days (warning threshold: ${thresholds.expiryWarning})` });
    }

    return results;
  }

  // ── Private Helpers ──

  _validateThresholds(data) {
    const { lowStockThreshold, criticalStockThreshold, expiryWarningDays, criticalExpiryDays } = data;

    if (criticalStockThreshold !== undefined && lowStockThreshold !== undefined) {
      if (criticalStockThreshold >= lowStockThreshold) {
        throw new Error('Critical stock threshold must be less than low stock threshold');
      }
    }

    if (criticalExpiryDays !== undefined && expiryWarningDays !== undefined) {
      if (criticalExpiryDays >= expiryWarningDays) {
        throw new Error('Critical expiry days must be less than expiry warning days');
      }
    }

    if (expiryWarningDays !== undefined && expiryWarningDays < 0) {
      throw new Error('Expiry warning days cannot be negative');
    }

    if (criticalExpiryDays !== undefined && criticalExpiryDays < 0) {
      throw new Error('Critical expiry days cannot be negative');
    }
  }

  async _invalidateCache(tenantId, branchId = null) {
    try {
      const patterns = [
        branchId ? `alert:thresholds:${tenantId}:${branchId}*` : `alert:thresholds:${tenantId}:*`,
        `alerts:${tenantId}:*`,
        `stock:alerts:${tenantId}`,
        `dashboard:stats:${tenantId}:*`,
        `realtime:inventory:${tenantId}:*`,
      ];

      for (const pattern of patterns) {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Alert settings cache invalidation failed');
    }
  }
}

export default new AlertSettingsService();
