import prisma from '../../../config/prisma.js';

class IntegrationRepository {
  async getProviders(tenantId, branchId = null) {
    return prisma.integrationProvider.findMany({
      where: {
        tenantId,
        branchId: branchId || null,
      },
    });
  }

  async getProviderByType(tenantId, providerType, branchId = null) {
    return prisma.integrationProvider.findFirst({
      where: {
        tenantId,
        providerType,
        branchId: branchId || null,
      },
    });
  }

  async updateProvider(tenantId, providerType, data, branchId = null) {
    const { providerName, isEnabled, isPrimary, config, updatedBy } = data;

    return prisma.integrationProvider.upsert({
      where: {
        tenantId_branchId_providerType_providerName: {
          tenantId,
          branchId: branchId || null,
          providerType,
          providerName,
        },
      },
      update: {
        isEnabled,
        isPrimary,
        config,
        updatedBy,
      },
      create: {
        tenantId,
        branchId: branchId || null,
        providerType,
        providerName,
        isEnabled,
        isPrimary,
        config,
        updatedBy,
      },
    });
  }

  async logHealth(tenantId, providerName, healthData) {
    return prisma.providerHealthLog.create({
      data: {
        tenantId,
        providerName,
        ...healthData,
      },
    });
  }

  async getLatestHealth(tenantId) {
    return prisma.providerHealthLog.findMany({
      where: { tenantId },
      orderBy: { checkedAt: 'desc' },
      distinct: ['providerName'],
    });
  }
}

export default new IntegrationRepository();
