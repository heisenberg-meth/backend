import redisClient from '../../../config/redis.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

const NOTIFICATION_COOLDOWN_TTL = 3600;

class AlertNotificationService {
  async notifyLowStock(alert) {
    const { medicineId, tenantId, branchId, currentStock, thresholdValue, severity } = alert;

    const dedupKey = `notification:dedup:low-stock:${tenantId}:${medicineId}:${branchId}`;
    const isDuplicate = await this._checkDedup(dedupKey);
    if (isDuplicate) return;

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { name: true, genericName: true },
    });

    const branch = branchId
      ? await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, code: true } })
      : null;

    const message = this._buildLowStockMessage(medicine, branch, currentStock, thresholdValue, severity);

    await Promise.allSettled([
      this._sendDashboardAlert(tenantId, branchId, 'LOW_STOCK', severity, message, alert),
      severity === 'CRITICAL' ? this._sendEmailAlert(tenantId, message, medicine) : Promise.resolve(),
      severity === 'CRITICAL' ? this._sendWhatsAppAlert(tenantId, message, medicine) : Promise.resolve(),
      this._broadcastWebSocket(tenantId, branchId, 'LOW_STOCK_ALERT', {
        medicineId,
        medicineName: medicine?.name,
        currentStock,
        thresholdValue,
        severity,
        branchName: branch?.name,
      }),
    ]);

    await this._setDedup(dedupKey, NOTIFICATION_COOLDOWN_TTL);
  }

  async notifyExpiryWarning(alert) {
    const { batchId, medicineId, tenantId, branchId, severity, daysRemaining } = alert;

    const dedupKey = `notification:dedup:expiry:${tenantId}:${batchId}`;
    const isDuplicate = await this._checkDedup(dedupKey);
    if (isDuplicate) return;

    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: batchId },
      select: { batchNumber: true, quantity: true, expiryDate: true, purchasePrice: true },
    });

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { name: true, genericName: true },
    });

    const potentialLoss = (batch?.quantity || 0) * (batch?.purchasePrice || 0);

    const message = this._buildExpiryMessage(medicine, batch, daysRemaining, potentialLoss, severity);

    await Promise.allSettled([
      this._sendDashboardAlert(tenantId, branchId, 'EXPIRY_WARNING', severity, message, alert),
      this._sendEmailAlert(tenantId, message, medicine),
      severity === 'CRITICAL' ? this._sendWhatsAppAlert(tenantId, message, medicine) : Promise.resolve(),
      this._broadcastWebSocket(tenantId, branchId, 'EXPIRY_ALERT', {
        medicineId,
        medicineName: medicine?.name,
        batchNumber: batch?.batchNumber,
        expiryDate: batch?.expiryDate,
        daysRemaining,
        quantity: batch?.quantity,
        potentialLoss,
        severity,
      }),
    ]);

    await this._setDedup(dedupKey, severity === 'CRITICAL' ? 1800 : NOTIFICATION_COOLDOWN_TTL);
  }

  async notifyOutOfStock(alert) {
    const { medicineId, tenantId, branchId, severity } = alert;

    const dedupKey = `notification:dedup:out-of-stock:${tenantId}:${medicineId}:${branchId}`;
    const isDuplicate = await this._checkDedup(dedupKey);
    if (isDuplicate) return;

    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
      select: { name: true, genericName: true, prescriptionRequired: true },
    });

    const branch = branchId
      ? await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true, code: true } })
      : null;

    const message = this._buildOutOfStockMessage(medicine, branch, severity);

    await Promise.allSettled([
      this._sendDashboardAlert(tenantId, branchId, 'OUT_OF_STOCK', severity, message, alert),
      this._sendEmailAlert(tenantId, message, medicine),
      this._sendWhatsAppAlert(tenantId, message, medicine),
      this._broadcastWebSocket(tenantId, branchId, 'OUT_OF_STOCK_ALERT', {
        medicineId,
        medicineName: medicine?.name,
        prescriptionRequired: medicine?.prescriptionRequired,
        severity,
        branchName: branch?.name,
      }),
    ]);

    await this._setDedup(dedupKey, 1800);
  }

  async notifyTransferRecommendation(tenantId, branchId, medicineId, medicineName, availableStock) {
    const message = `Stock transfer recommended: ${medicineName} is low at this branch, but ${availableStock} units available elsewhere.`;

    await Promise.allSettled([
      this._sendDashboardAlert(tenantId, branchId, 'TRANSFER_RECOMMENDED', 'INFO', message, { medicineId }),
      this._broadcastWebSocket(tenantId, branchId, 'TRANSFER_RECOMMENDATION', {
        medicineId,
        medicineName,
        availableStock,
      }),
    ]);
  }

  async _sendDashboardAlert(tenantId, branchId, type, severity, message, metadata) {
    try {
      await prisma.stockAlert.create({
        data: {
          tenantId,
          branchId,
          medicineId: metadata?.medicineId,
          type,
          severity,
          message,
          currentStock: metadata?.currentStock || 0,
          thresholdValue: metadata?.thresholdValue || 0,
          isResolved: false,
        },
      });

      await emitEvent('NOTIFICATION_CREATED', {
        tenantId,
        branchId,
        type,
        severity,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create dashboard alert');
    }
  }

  async _sendEmailAlert(tenantId, message, medicine) {
    try {
      await emitEvent('send-email', {
        tenantId,
        subject: `[${medicine?.name || 'Medicine'}] Alert: Action Required`,
        body: message,
        type: 'alert',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send email alert');
    }
  }

  async _sendWhatsAppAlert(tenantId, message, medicine) {
    try {
      await emitEvent('send-whatsapp', {
        tenantId,
        message: `[Alert] ${medicine?.name}: ${message}`,
        type: 'alert',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send WhatsApp alert');
    }
  }

  async _broadcastWebSocket(tenantId, branchId, event, payload) {
    try {
      const io = globalThis.socketIO;
      if (!io) return;

      const room = branchId ? `branch:${branchId}` : `tenant:${tenantId}`;
      io.to(room).emit(event, {
        ...payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast WebSocket alert');
    }
  }

  _buildLowStockMessage(medicine, branch, currentStock, threshold, severity) {
    const location = branch ? ` at ${branch.name} (${branch.code})` : '';
    const urgency = severity === 'CRITICAL' ? 'URGENT: ' : '';
    return `${urgency}${medicine?.name || 'Medicine'}${location} stock is critically low: ${currentStock} units (threshold: ${threshold}). Immediate reorder required.`;
  }

  _buildExpiryMessage(medicine, batch, daysRemaining, potentialLoss, severity) {
    const urgency = severity === 'CRITICAL' ? 'URGENT: ' : '';
    const lossStr = potentialLoss > 0 ? ` (potential loss: ₹${potentialLoss.toFixed(2)})` : '';
    return `${urgency}Batch ${batch?.batchNumber || 'N/A'} of ${medicine?.name || 'Medicine'} expires in ${daysRemaining} days${lossStr}. Take immediate action.`;
  }

  _buildOutOfStockMessage(medicine, branch, severity) {
    const location = branch ? ` at ${branch.name} (${branch.code})` : '';
    const urgency = severity === 'CRITICAL' ? 'CRITICAL EMERGENCY: ' : '';
    const rxNote = medicine?.prescriptionRequired ? ' [PRESCRIPTION REQUIRED]' : '';
    return `${urgency}${medicine?.name || 'Medicine'}${rxNote} is OUT OF STOCK${location}. Patient treatment at risk.`;
  }

  async _checkDedup(key) {
    try {
      const exists = await redisClient.get(key);
      return !!exists;
    } catch {
      return false;
    }
  }

  async _setDedup(key, ttl) {
    try {
      await redisClient.set(key, '1', 'EX', ttl);
    } catch (error) {
      logger.error({ error, key }, '[ALERT-NOTIFICATION] Failed to set deduplication key');
    }
  }
}

export default new AlertNotificationService();
