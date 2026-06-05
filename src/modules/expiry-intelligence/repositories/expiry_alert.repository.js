import prisma from '../../../config/prisma.js';

class ExpiryAlertRepository {
  async createAlert(data) {
    return prisma.expiryAlert.create({
      data,
      include: { batch: { include: { medicine: true } } },
    });
  }

  async findActiveAlerts(tenantId) {
    return prisma.expiryAlert.findMany({
      where: {
        tenantId,
        resolved: false,
        medicine: {
          deletedAt: null,
          isActive: true,
        },
      },
      include: {
        batch: { include: { medicine: true } },
        medicine: true,
      },
      orderBy: { daysRemaining: 'asc' },
    });
  }

  async findExistingAlert(tenantId, batchId, severity) {
    return prisma.expiryAlert.findFirst({
      where: { tenantId, batchId, severity, resolved: false },
    });
  }

  async findCriticalAlerts(tenantId) {
    return prisma.expiryAlert.findMany({
      where: {
        tenantId,
        resolved: false,
        severity: { in: ['Critical', 'critical'] },
        medicine: {
          deletedAt: null,
          isActive: true,
        },
      },
      include: {
        batch: {
          include: {
            medicine: { select: { id: true, name: true, genericName: true, barcode: true } },
          },
        },
        medicine: true,
      },
      orderBy: { daysRemaining: 'asc' },
    });
  }

  async resolveAlert(id, tenantId) {
    return prisma.expiryAlert.update({
      where: { id, tenantId },
      data: { resolved: true },
    });
  }
}

export default new ExpiryAlertRepository();
