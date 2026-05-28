import prisma from "../../../config/prisma.js";

class AlertRepository {
  async createAlert(data) {
    return prisma.stockAlert.create({
      data,
      include: { medicine: true }
    });
  }

  async findActiveAlerts(tenantId) {
    return prisma.stockAlert.findMany({
      where: {
        tenantId,
        isResolved: false,
      },
      include: { medicine: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveAlert(id, tenantId) {
    return prisma.stockAlert.update({
      where: { id, tenantId },
      data: {
        isResolved: true,
        resolvedAt: new Date()
      }
    });
  }

  async findExistingAlert(tenantId, medicineId, type) {
    return prisma.stockAlert.findFirst({
      where: {
        tenantId,
        medicineId,
        type,
        isResolved: false
      }
    });
  }
}

export default new AlertRepository();
