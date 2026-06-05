import { localEventBus } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import alertNotificationService from '../notifications/alert-notification.service.js';
import alertRepository from '../repositories/alert.repository.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const ALERT_ESCALATION_TTL = 86400;

class AlertEventListeners {
  init() {
    this._registerLowStockListener();
    this._registerOutOfStockListener();
    this._registerExpiryWarningListener();
    this._RegisterAlertResolvedListener();
    this._registerScanCompletedListener();
    this._registerReorderRecommendedListener();
    this._registerTransferRecommendedListener();

    logger.info('[ALERT-EVENTS] All medicine alert event listeners registered');
  }

  _registerLowStockListener() {
    localEventBus.on(DOMAIN_EVENTS.LOW_STOCK_DETECTED, async (data) => {
      try {
        const { medicineId, tenantId, totalStock, threshold } = data;

        const alert = await alertRepository.upsertStockAlert({
          tenantId,
          branchId: data.branchId || null,
          medicineId,
          type: 'LOW_STOCK',
          severity: totalStock <= 0 ? 'CRITICAL' : 'WARNING',
          message: `${data.medicineName || medicineId}: ${totalStock} units (threshold: ${threshold})`,
          currentStock: totalStock,
          thresholdValue: threshold,
        });

        await alertNotificationService.notifyLowStock({
          ...alert,
          medicineId,
          tenantId,
        });

        await this._checkEscalation(tenantId, medicineId, 'LOW_STOCK');
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.LOW_STOCK_DETECTED },
          'Failed to process low stock event',
        );
      }
    });
  }

  _registerOutOfStockListener() {
    localEventBus.on(DOMAIN_EVENTS.OUT_OF_STOCK_DETECTED, async (data) => {
      try {
        const { medicineId, tenantId, totalStock, threshold } = data;

        const alert = await alertRepository.upsertStockAlert({
          tenantId,
          branchId: data.branchId || null,
          medicineId,
          type: 'OUT_OF_STOCK',
          severity: 'CRITICAL',
          message: `${data.medicineName || medicineId}: OUT OF STOCK`,
          currentStock: totalStock,
          thresholdValue: threshold,
        });

        await alertNotificationService.notifyOutOfStock({
          ...alert,
          medicineId,
          tenantId,
        });
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.OUT_OF_STOCK_DETECTED },
          'Failed to process out of stock event',
        );
      }
    });
  }

  _registerExpiryWarningListener() {
    localEventBus.on(DOMAIN_EVENTS.EXPIRY_WARNING, async (data) => {
      try {
        const { batchId, medicineId, daysRemaining, tenantId } = data;

        await alertNotificationService.notifyExpiryWarning({
          batchId,
          medicineId,
          tenantId,
          branchId: data.branchId,
          severity: daysRemaining <= 15 ? 'CRITICAL' : 'WARNING',
          daysRemaining,
        });
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.EXPIRY_WARNING },
          'Failed to process expiry warning event',
        );
      }
    });
  }

  _RegisterAlertResolvedListener() {
    localEventBus.on(DOMAIN_EVENTS.ALERT_RESOLVED, async (data) => {
      try {
        const { alertId, tenantId, resolvedBy } = data;

        const escalationKey = `alert:escalation:${tenantId}:${alertId}`;
        await redisClient.del(escalationKey);

        await this._broadcastResolution(tenantId, alertId, resolvedBy);
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.ALERT_RESOLVED },
          'Failed to process alert resolved event',
        );
      }
    });
  }

  _registerScanCompletedListener() {
    localEventBus.on(DOMAIN_EVENTS.ALERT_SCAN_COMPLETED, async (data) => {
      try {
        const { tenantId, expiryAlerts, stockAlerts } = data;

        await redisClient.set(
          `alerts:last-scan:${tenantId}`,
          JSON.stringify({
            expiryAlerts,
            stockAlerts,
            total: expiryAlerts + stockAlerts,
            timestamp: new Date().toISOString(),
          }),
          'EX',
          86400,
        );

        logger.info(
          { tenantId, expiryAlerts, stockAlerts },
          `[ALERT-SCAN] Completed: ${expiryAlerts + stockAlerts} total alerts`,
        );
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.ALERT_SCAN_COMPLETED },
          'Failed to process scan completed event',
        );
      }
    });
  }

  _registerReorderRecommendedListener() {
    localEventBus.on(DOMAIN_EVENTS.REORDER_RECOMMENDED, async (data) => {
      try {
        const { medicineId, tenantId, recommendedQuantity } = data;

        await alertNotificationService.notifyLowStock({
          medicineId,
          tenantId,
          severity: 'WARNING',
          currentStock: data.currentStock || 0,
          thresholdValue: data.threshold || 0,
          message: `Reorder recommended: ${recommendedQuantity} units for ${data.medicineName || medicineId}`,
        });
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.REORDER_RECOMMENDED },
          'Failed to process reorder event',
        );
      }
    });
  }

  _registerTransferRecommendedListener() {
    localEventBus.on(DOMAIN_EVENTS.STOCK_TRANSFER_RECOMMENDED, async (data) => {
      try {
        const { tenantId, branchId, medicineId, medicineName, availableStock } = data;

        await alertNotificationService.notifyTransferRecommendation(
          tenantId,
          branchId,
          medicineId,
          medicineName,
          availableStock,
        );
      } catch (error) {
        logger.error(
          { error, event: DOMAIN_EVENTS.STOCK_TRANSFER_RECOMMENDED },
          'Failed to process transfer event',
        );
      }
    });
  }

  async _checkEscalation(tenantId, medicineId, alertType) {
    const escalationKey = `alert:escalation:${tenantId}:${medicineId}:${alertType}`;
    const count = await redisClient.incr(escalationKey);

    if (count === 1) {
      await redisClient.expire(escalationKey, ALERT_ESCALATION_TTL);
    }

    if (count >= 3) {
      logger.warn(
        { tenantId, medicineId, alertType, count },
        `[ALERT-ESCALATION] Alert triggered ${count} times, escalating`,
      );

      await redisClient.set(
        `alert:escalated:${tenantId}:${medicineId}:${alertType}`,
        JSON.stringify({
          count,
          escalatedAt: new Date().toISOString(),
        }),
        'EX',
        ALERT_ESCALATION_TTL,
      );
    }
  }

  async _broadcastResolution(tenantId, alertId, resolvedBy) {
    try {
      const io = globalThis.socketIO;
      if (!io) return;

      io.to(`tenant:${tenantId}`).emit('ALERT_RESOLVED', {
        alertId,
        resolvedBy,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast alert resolution');
    }
  }
}

export default new AlertEventListeners();
