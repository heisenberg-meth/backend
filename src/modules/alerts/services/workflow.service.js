import prisma from '../../../config/prisma.js';
import alertDeduplicationService from './deduplication.service.js';
import alertSeverityEngine from './severity-engine.service.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

const MAX_SNOOZE_HOURS = 168;

class AlertWorkflowService {
  async createAlert(payload) {
    const { tenantId, medicineId, branchId, type, currentStock, thresholdValue } = payload;

    const isDuplicate = await alertDeduplicationService.checkDuplicate(
      tenantId,
      medicineId,
      branchId,
      type
    );

    if (isDuplicate) {
      logger.info({ medicineId, type }, 'Duplicate alert suppressed');
      return null;
    }

    const severityData = await alertSeverityEngine.calculatePredictiveSeverity(
      medicineId,
      tenantId,
      branchId,
      currentStock,
    );

    const message = this._buildAlertMessage(type, payload, severityData);

    const alert = await prisma.stockAlert.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        type,
        severity: severityData.severity,
        alertStatus: 'ACTIVE',
        message,
        currentStock,
        thresholdValue,
        daysRemaining: severityData.daysRemaining,
        isResolved: false,
      },
      include: {
        medicine: { select: { name: true, genericName: true, prescriptionRequired: true } },
      },
    });

    await alertDeduplicationService.markProcessed(tenantId, medicineId, branchId, type);

    emitLocalEvent(DOMAIN_EVENTS.ALERT_CREATED, {
      alertId: alert.id,
      tenantId,
      medicineId,
      type,
      severity: severityData.severity,
      timestamp: new Date().toISOString(),
    });

    return alert;
  }

  async snoozeAlert(alertId, tenantId, userId, { snoozedUntil, reason }) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!alert) throw new Error('Alert not found');
    if (alert.isResolved) throw new Error('Cannot snooze resolved alert');

    const snoozeDate = new Date(snoozedUntil);
    const maxSnoozeDate = new Date();
    maxSnoozeDate.setHours(maxSnoozeDate.getHours() + MAX_SNOOZE_HOURS);

    if (snoozeDate > maxSnoozeDate) {
      throw new Error(`Maximum snooze duration is ${MAX_SNOOZE_HOURS} hours`);
    }

    if (snoozeDate <= new Date()) {
      throw new Error('Snooze date must be in the future');
    }

    const updated = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        alertStatus: 'SNOOZED',
        snoozedUntil: snoozeDate,
        snoozeReason: reason || null,
        snoozedBy: userId,
      },
    });

    await alertDeduplicationService.setSnoozeExpiry(alertId, tenantId, snoozeDate);

    emitLocalEvent(DOMAIN_EVENTS.ALERT_SNOOZED, {
      alertId,
      tenantId,
      snoozedBy: userId,
      reason,
      snoozedUntil: snoozeDate.toISOString(),
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async acknowledgeAlert(alertId, tenantId, userId, {  purchaseOrderId } = {}) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!alert) throw new Error('Alert not found');

    const data = {
      alertStatus: 'ACKNOWLEDGED',
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
    };

    if (purchaseOrderId) {
      data.purchaseOrderId = purchaseOrderId;
      data.alertStatus = 'ON_ORDER';
    }

    return prisma.stockAlert.update({
      where: { id: alertId },
      data,
    });
  }

  async resolveAlert(alertId, tenantId, userId, { note } = {}) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!alert) throw new Error('Alert not found');

    const resolved = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNote: note || null,
        alertStatus: 'RESOLVED',
      },
    });

    await alertDeduplicationService.clearDedupe(
      tenantId,
      alert.medicineId,
      alert.branchId,
      alert.type
    );

    await alertDeduplicationService.clearEscalation(alertId, tenantId);
    await alertDeduplicationService.clearSnoozeExpiry(alertId, tenantId);

    emitLocalEvent(DOMAIN_EVENTS.ALERT_RESOLVED, {
      alertId,
      tenantId,
      resolvedBy: userId,
      timestamp: new Date().toISOString(),
    });

    return resolved;
  }

  async raisePurchaseOrder(alertId, tenantId, userId, { supplierId, quantity, priority } = {}) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
      include: { medicine: true },
    });

    if (!alert) throw new Error('Alert not found');

    let preferredSupplier = supplierId
      ? await prisma.medicineSupplier.findFirst({
          where: { medicineId: alert.medicineId, supplierId, isPreferred: true },
          include: { supplier: true },
        })
      : await prisma.medicineSupplier.findFirst({
          where: { medicineId: alert.medicineId, isPreferred: true },
          include: { supplier: true },
        });

    if (!preferredSupplier) {
      preferredSupplier = await prisma.medicineSupplier.findFirst({
        where: { medicineId: alert.medicineId },
        include: { supplier: true },
      });
    }

    const leadTime = preferredSupplier?.leadDays || 7;
    const adu = await alertSeverityEngine._getAverageDailyUsage(
      alert.medicineId,
      tenantId,
      alert.branchId
    );
    const safetyStock = Math.ceil(adu * leadTime * 0.5);
    const suggestedQty = quantity || Math.ceil(adu * leadTime + safetyStock);

    const unitPrice = preferredSupplier?.averagePurchasePrice || alert.medicine.unitPrice || 0;
    const subtotal = suggestedQty * unitPrice;
    const gstAmount = subtotal * ((alert.medicine.gstPercentage || 12) / 100);
    const totalAmount = subtotal + gstAmount;

    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(expectedDeliveryDate.getDate() + leadTime);

    const now = new Date();
    const orderNumber = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${alert.medicineId.slice(0, 8).toUpperCase()}`;

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId: alert.branchId,
        orderNumber,
        supplierId: preferredSupplier?.supplierId || null,
        status: 'DRAFT',
        subtotal,
        gstAmount,
        totalAmount,
        expectedDeliveryDate,
        notes: `Auto-generated from alert #${alertId}: ${alert.message}. Priority: ${priority || 'NORMAL'}`,
        items: {
          create: {
            medicineId: alert.medicineId,
            quantity: suggestedQty,
            unitPrice,
            gstPercentage: alert.medicine.gstPercentage || 12,
          },
        },
      },
      include: {
        supplier: { select: { name: true, email: true } },
        items: { include: { medicine: { select: { name: true } } } },
      },
    });

    await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        alertStatus: 'ON_ORDER',
        purchaseOrderId: po.id,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });

    emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RAISED, {
      alertId,
      purchaseOrderId: po.id,
      orderNumber: po.orderNumber,
      tenantId,
      timestamp: new Date().toISOString(),
    });

    return po;
  }

  _buildAlertMessage(type, payload, severityData) {
    const medicineName = payload.medicineName || payload.medicineId;
    const branchInfo = payload.branchName ? ` at ${payload.branchName}` : '';

    switch (type) {
      case 'LOW_STOCK':
        return `${medicineName}${branchInfo}: ${payload.currentStock} units remaining (threshold: ${payload.thresholdValue}). ${severityData.daysRemaining} days of stock left.`;
      case 'OUT_OF_STOCK':
        return `${medicineName}${branchInfo}: OUT OF STOCK. ${severityData.isLifeSaving ? 'LIFE-SAVING MEDICINE - IMMEDIATE ACTION REQUIRED.' : 'Reorder immediately.'}`;
      case 'EXPIRING':
        return `${medicineName}${branchInfo}: Batch ${payload.batchNumber} expires in ${severityData.daysRemaining} days.`;
      case 'EXPIRED':
        return `${medicineName}${branchInfo}: Batch ${payload.batchNumber} has EXPIRED. Remove from inventory immediately.`;
      case 'OVERSTOCK':
        return `${medicineName}${branchInfo}: ${payload.currentStock} units in stock (threshold: ${payload.thresholdValue}). Consider reducing orders.`;
      case 'PROCUREMENT_DELAY':
        return `${medicineName}${branchInfo}: Procurement delay detected. Expected delivery overdue.`;
      default:
        return `${medicineName}${branchInfo}: Alert triggered.`;
    }
  }
}

export default new AlertWorkflowService();
