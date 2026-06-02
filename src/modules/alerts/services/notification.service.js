import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { getIO } from '../../../config/socket.js';
import logger from '../../../shared/utils/logger.js';

const NOTIFICATION_COOLDOWN_TTL = 3600;

class AlertNotificationService {
  async dispatchAlert(alert) {
    const { id: alertId, tenantId, branchId, type, severity, message, medicineId } = alert;

    const dedupeKey = `notification:alert:${tenantId}:${alertId}`;
    const isDuplicate = await redisClient.get(dedupeKey);
    if (isDuplicate) return;

    const medicine = medicineId
      ? await prisma.medicine.findUnique({
          where: { id: medicineId },
          select: { name: true, genericName: true },
        })
      : null;

    const branch = branchId
      ? await prisma.branch.findUnique({
          where: { id: branchId },
          select: { name: true, code: true },
        })
      : null;

    await Promise.allSettled([
      this._sendDashboardAlert(alert),
      this._sendEmailAlert(tenantId, severity, message, medicine, branch),
      severity === 'CRITICAL'
        ? this._sendWhatsAppAlert(tenantId, message, medicine)
        : Promise.resolve(),
      this._broadcastWebSocket(tenantId, branchId, type, {
        alertId,
        medicineName: medicine?.name,
        severity,
        message,
        branchName: branch?.name,
      }),
    ]);

    await redisClient.set(dedupeKey, '1', 'EX', NOTIFICATION_COOLDOWN_TTL);
  }

  async _sendDashboardAlert(alert) {
    try {
      await emitEvent('NOTIFICATION_CREATED', {
        tenantId: alert.tenantId,
        branchId: alert.branchId,
        type: 'ALERT',
        severity: alert.severity,
        message: alert.message,
        alertId: alert.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send dashboard alert');
    }
  }

  async _sendEmailAlert(tenantId, severity, message, medicine, branch) {
    try {
      const location = branch ? ` [${branch.name}]` : '';
      await emitEvent('send-email', {
        tenantId,
        subject: `[${severity}] Alert: ${medicine?.name || 'Inventory'}${location}`,
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
        message: `[${medicine?.name || 'Alert'}] ${message}`,
        type: 'alert',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send WhatsApp alert');
    }
  }

  async _broadcastWebSocket(tenantId, branchId, eventType, payload) {
    try {
      const io = getIO();
      if (!io) return;

      if (branchId) {
        io.to(`branch:${branchId}`).emit('ALERT_CREATED', payload);
      }

      io.to(`tenant:${tenantId}`).emit('ALERT_CREATED', payload);
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast WebSocket alert');
    }
  }
}

export default new AlertNotificationService();
