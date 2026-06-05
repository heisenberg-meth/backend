import redisClient from '../../../config/redis.js';
import alertRepository from '../repositories/alert.repository.js';
import expiryService from '../../inventory/service/expiry.service.js';
import prisma from '../../../config/prisma.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class AlertService {
  async processDailyExpiryChecks() {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

    for (const tenant of tenants) {
      // 1. Check for expired
      const expiredBatches = await expiryService.getNearExpiryBatches(tenant.id, 0);
      for (const batch of expiredBatches) {
        await this.triggerAlert(
          tenant.id,
          batch.medicineId,
          'EXPIRED',
          `Batch ${batch.batchNumber} of ${batch.medicine.name} has expired.`,
        );
      }

      // 2. Check for near-expiry (90 days)
      const nearExpiryBatches = await expiryService.getNearExpiryBatches(tenant.id, 90);
      for (const batch of nearExpiryBatches) {
        if (batch.expiryDate > new Date()) {
          await this.triggerAlert(
            tenant.id,
            batch.medicineId,
            'EXPIRING',
            `Batch ${batch.batchNumber} of ${batch.medicine.name} is expiring soon (${new Date(batch.expiryDate).toLocaleDateString()}).`,
          );
        }
      }
    }
  }

  async triggerAlert(tenantId, medicineId, type, message) {
    const existing = await alertRepository.findExistingAlert(tenantId, medicineId, type);
    if (existing) return existing;

    const alert = await alertRepository.createAlert({
      tenantId,
      medicineId,
      type,
      message,
    });

    await this.invalidateAlertCache(tenantId);
    await eventBus.publish('STOCK_ALERT_CREATED', alert);
    return alert;
  }

  async getActiveAlerts(tenantId) {
    const cacheKey = `stock:alerts:${tenantId}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }

    const alerts = await alertRepository.findActiveAlerts(tenantId);

    try {
      await redisClient.set(cacheKey, JSON.stringify(alerts), 'EX', 300);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }

    return alerts;
  }

  async resolveAlert(id, tenantId) {
    const alert = await alertRepository.resolveAlert(id, tenantId);
    await this.invalidateAlertCache(tenantId);
    return alert;
  }

  async invalidateAlertCache(tenantId) {
    try {
      await redisClient.del(`stock:alerts:${tenantId}`);
    } catch (err) {
      logger.error('[REDIS ERROR]', err);
    }
  }
}

export default new AlertService();
