import prisma from '../../../config/prisma.js';
import alertDeduplicationService from './deduplication.service.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

const ESCALATION_RULES = {
  CRITICAL: { immediate: true, intervalHours: 4, maxEscalations: 5 },
  HIGH: { immediate: false, intervalHours: 8, maxEscalations: 3 },
  MEDIUM: { immediate: false, intervalHours: 24, maxEscalations: 2 },
  LOW: { immediate: false, intervalHours: 48, maxEscalations: 1 },
  INFO: { immediate: false, intervalHours: 72, maxEscalations: 1 },
};

class AlertEscalationEngine {
  async evaluateAndEscalate(alertId, tenantId) {
    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
      include: { medicine: { select: { name: true, prescriptionRequired: true } } },
    });

    if (!alert || alert.isResolved) return null;

    const rules = ESCALATION_RULES[alert.severity] || ESCALATION_RULES.INFO;

    if (alert.escalationCount >= rules.maxEscalations) {
      logger.warn({ alertId, escalationCount: alert.escalationCount }, 'Max escalations reached');
      return null;
    }

    const escalationCount = await alertDeduplicationService.trackEscalation(alertId, tenantId);

    const updatedAlert = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        escalationCount,
        escalatedAt: new Date(),
        alertStatus: 'ESCALATED',
      },
      include: { medicine: { select: { name: true, prescriptionRequired: true } } },
    });

    emitLocalEvent(DOMAIN_EVENTS.ALERT_ESCALATED, {
      alertId,
      tenantId,
      escalationCount,
      severity: alert.severity,
      medicineName: alert.medicine?.name,
      timestamp: new Date().toISOString(),
    });

    return updatedAlert;
  }

  async escalateLifeSavingMedicine(alertId, tenantId) {
    const alert = await prisma.stockAlert.findUnique({
      where: { id: alertId },
      include: { medicine: { select: { name: true, prescriptionRequired: true } } },
    });

    if (!alert || !alert.medicine?.prescriptionRequired) return null;

    return this.evaluateAndEscalate(alertId, tenantId);
  }

  async autoReactivateSnoozedAlerts(tenantId) {
    const now = new Date();

    const snoozedAlerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        alertStatus: 'SNOOZED',
        snoozedUntil: { lte: now },
      },
    });

    for (const alert of snoozedAlerts) {
      await prisma.stockAlert.update({
        where: { id: alert.id },
        data: {
          alertStatus: 'ACTIVE',
          snoozedUntil: null,
          snoozeReason: null,
        },
      });

      await alertDeduplicationService.clearSnoozeExpiry(alert.id, tenantId);

      logger.info({ alertId: alert.id }, 'Alert auto-reactivated after snooze expiry');
    }

    return snoozedAlerts.length;
  }

  async reopenCancelledPOAlerts(tenantId, purchaseOrderId) {
    const alerts = await prisma.stockAlert.findMany({
      where: {
        tenantId,
        purchaseOrderId,
        alertStatus: 'ON_ORDER',
      },
    });

    for (const alert of alerts) {
      await prisma.stockAlert.update({
        where: { id: alert.id },
        data: {
          alertStatus: 'ACTIVE',
          purchaseOrderId: null,
          escalationCount: 0,
        },
      });

      await alertDeduplicationService.clearDedupe(
        tenantId,
        alert.medicineId,
        alert.branchId,
        alert.type
      );

      logger.info({ alertId: alert.id, purchaseOrderId }, 'Alert reopened due to PO cancellation');
    }

    return alerts.length;
  }

  async processEscalationQueue() {
    const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });
    let totalEscalated = 0;

    for (const tenant of tenants) {
      const criticalAlerts = await prisma.stockAlert.findMany({
        where: {
          tenantId: tenant.id,
          severity: 'CRITICAL',
          alertStatus: { in: ['ACTIVE', 'ESCALATED'] },
          isResolved: false,
          escalatedAt: { lt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
        },
      });

      for (const alert of criticalAlerts) {
        await this.evaluateAndEscalate(alert.id, tenant.id);
        totalEscalated++;
      }

      const highAlerts = await prisma.stockAlert.findMany({
        where: {
          tenantId: tenant.id,
          severity: 'HIGH',
          alertStatus: { in: ['ACTIVE', 'ESCALATED'] },
          isResolved: false,
          escalatedAt: { lt: new Date(Date.now() - 8 * 60 * 60 * 1000) },
        },
      });

      for (const alert of highAlerts) {
        await this.evaluateAndEscalate(alert.id, tenant.id);
        totalEscalated++;
      }

      const reactivated = await this.autoReactivateSnoozedAlerts(tenant.id);
      totalEscalated += reactivated;
    }

    return totalEscalated;
  }
}

export default new AlertEscalationEngine();
