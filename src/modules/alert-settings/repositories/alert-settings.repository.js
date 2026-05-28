import prisma from '../../../config/prisma.js';

class AlertSettingsRepository {
  async getByTenantAndBranch(tenantId, branchId = null) {
    return prisma.alertSettings.findUnique({
      where: {
        tenantId_branchId: { tenantId, branchId },
      },
      include: {
        overrides: {
          include: { medicine: true },
        },
      },
    });
  }

  async upsert(tenantId, data, branchId = null) {
    return prisma.alertSettings.upsert({
      where: {
        tenantId_branchId: { tenantId, branchId },
      },
      update: data,
      create: { tenantId, branchId, ...data },
      include: {
        overrides: true,
      },
    });
  }

  async createOverride(tenantId, alertSettingsId, data) {
    return prisma.alertThresholdOverride.create({
      data: {
        tenantId,
        alertSettingsId,
        ...data,
      },
      include: { medicine: true },
    });
  }

  async updateOverride(tenantId, overrideId, data) {
    return prisma.alertThresholdOverride.update({
      where: { id: overrideId, tenantId },
      data,
      include: { medicine: true },
    });
  }

  async deleteOverride(tenantId, overrideId) {
    return prisma.alertThresholdOverride.delete({
      where: { id: overrideId, tenantId },
    });
  }

  async getOverrides(tenantId, alertSettingsId) {
    return prisma.alertThresholdOverride.findMany({
      where: {
        tenantId,
        alertSettingsId,
      },
      include: { medicine: true },
    });
  }

  async getOverrideByMedicine(tenantId, alertSettingsId, medicineId) {
    return prisma.alertThresholdOverride.findUnique({
      where: {
        alertSettingsId_medicineId: { alertSettingsId, medicineId },
      },
    });
  }
}

export default new AlertSettingsRepository();
