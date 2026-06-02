import prisma from '../../../config/prisma.js';
import notificationService from '../../patients/services/notification.service.js';

class AlertService {
  async getAlerts(tenantId) {
    const [stockAlerts, expiryAlerts] = await Promise.all([
      prisma.stockAlert.findMany({
        where: { tenantId, isResolved: false },
        include: {
          medicine: { select: { id: true, name: true, reorderLevel: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expiryAlert.findMany({
        where: { tenantId, isResolved: false },
        include: {
          medicine: { select: { id: true, name: true } },
          batch: { select: { id: true, batchNumber: true, quantity: true, expiryDate: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      stockAlerts: stockAlerts.map((a) => ({
        id: a.id,
        type: 'stock',
        alertType: a.type,
        message: a.message,
        medicineId: a.medicineId,
        medicineName: a.medicine.name,
        snoozedUntil: a.snoozedUntil,
        createdAt: a.createdAt,
      })),
      expiryAlerts: expiryAlerts.map((a) => ({
        id: a.id,
        type: 'expiry',
        severity: a.severity,
        daysRemaining: a.daysRemaining,
        message: `${a.medicine.name} batch ${a.batch.batchNumber} expires ${a.batch.expiryDate.toISOString().split('T')[0]}`,
        medicineId: a.medicineId,
        medicineName: a.medicine.name,
        batchId: a.batch.id,
        batchNumber: a.batch.batchNumber,
        quantity: a.batch.quantity,
        expiryDate: a.batch.expiryDate,
        createdAt: a.createdAt,
      })),
    };
  }

  async getLowStockAlerts(tenantId) {
    const alerts = await prisma.stockAlert.findMany({
      where: { tenantId, isResolved: false, type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] } },
      include: { medicine: { select: { id: true, name: true, reorderLevel: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return alerts.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      medicineId: a.medicineId,
      medicineName: a.medicine.name,
      snoozedUntil: a.snoozedUntil,
      createdAt: a.createdAt,
    }));
  }

  async getExpiringAlerts(tenantId) {
    const alerts = await prisma.expiryAlert.findMany({
      where: { tenantId, isResolved: false },
      include: {
        medicine: { select: { id: true, name: true } },
        batch: {
          select: {
            id: true,
            batchNumber: true,
            quantity: true,
            expiryDate: true,
            purchasePrice: true,
          },
        },
      },
      orderBy: { daysRemaining: 'asc' },
    });

    return alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      daysRemaining: a.daysRemaining,
      medicineId: a.medicineId,
      medicineName: a.medicine.name,
      batchId: a.batch.id,
      batchNumber: a.batch.batchNumber,
      quantity: a.batch.quantity,
      expiryDate: a.batch.expiryDate,
      potentialLoss: a.batch.quantity * a.batch.purchasePrice,
      createdAt: a.createdAt,
    }));
  }

  async snoozeAlert(tenantId, alertId, { snoozedUntil }) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!alert) throw new Error('Alert not found');

    return prisma.stockAlert.update({
      where: { id: alertId },
      data: { snoozedUntil: new Date(snoozedUntil) },
    });
  }

  async markOnOrder(tenantId, alertId) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
    });

    if (!alert) throw new Error('Alert not found');

    return prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
      },
    });
  }

  async raisePurchaseOrder(tenantId, alertId) {
    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, tenantId },
      include: { medicine: true },
    });

    if (!alert) throw new Error('Alert not found');

    const preferredSupplier = await prisma.medicineSupplier.findFirst({
      where: { medicineId: alert.medicineId, isPreferred: true },
      include: { supplier: true },
    });

    const reorderQty = alert.medicine.reorderLevel * 2 || 20;
    const now = new Date();
    const orderNumber = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${alert.medicineId.slice(0, 8)}`;

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        orderNumber,
        supplierId: preferredSupplier?.supplierId || null,
        subtotal: reorderQty * alert.medicine.unitPrice,
        totalAmount: reorderQty * alert.medicine.unitPrice,
        status: 'DRAFT',
        notes: `Auto-generated from stock alert: ${alert.message}`,
        items: {
          create: {
            medicineId: alert.medicineId,
            medicineName: alert.medicine.name,
            currentStock: 0,
            reorderQty,
            quantity: reorderQty,
            unitPrice: alert.medicine.unitPrice,
            totalAmount: reorderQty * alert.medicine.unitPrice,
          },
        },
      },
      include: { items: true },
    });

    await prisma.stockAlert.update({
      where: { id: alertId },
      data: { isResolved: true, resolvedAt: new Date() },
    });

    return purchaseOrder;
  }

  async sendEmailNotification(tenantId, data) {
    return notificationService.sendEmail(tenantId, {
      ...data,
      type: 'ALERT',
    });
  }

  async sendSmsNotification(tenantId, data) {
    return notificationService.sendSms(tenantId, {
      ...data,
      type: 'ALERT',
    });
  }

  async sendWhatsAppNotification(tenantId, data) {
    return notificationService.sendWhatsApp(tenantId, {
      ...data,
      type: 'ALERT',
    });
  }
}

export default new AlertService();
