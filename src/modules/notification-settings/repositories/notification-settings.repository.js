import prisma from '../../../config/prisma.js';

class NotificationSettingsRepository {
  async getByTenantAndBranch(tenantId, branchId = null) {
    return prisma.notificationSettings.findUnique({
      where: {
        tenantId_branchId: { tenantId, branchId },
      },
      include: {
        channelConfigs: {
          where: { isActive: true },
          orderBy: { priority: 'desc' },
        },
        escalationPolicies: {
          where: { isActive: true },
          include: { rules: { orderBy: { level: 'asc' } } },
        },
        reminderRules: {
          where: { isActive: true },
        },
      },
    });
  }

  async getGlobalSettings(tenantId) {
    return this.getByTenantAndBranch(tenantId, null);
  }

  async upsert(tenantId, data, branchId = null) {
    // Find existing record first (compound unique with null branchId doesn't work in Prisma upsert)
    const existing = await prisma.notificationSettings.findFirst({
      where: { tenantId, branchId },
    });

    if (existing) {
      return prisma.notificationSettings.update({
        where: { id: existing.id },
        data,
        include: {
          channelConfigs: true,
          escalationPolicies: { include: { rules: true } },
          reminderRules: true,
        },
      });
    }

    return prisma.notificationSettings.create({
      data: { tenantId, branchId, ...data },
      include: {
        channelConfigs: true,
        escalationPolicies: { include: { rules: true } },
        reminderRules: true,
      },
    });
  }

  async updateChannelConfig(tenantId, channelConfigId, data) {
    return prisma.notificationChannelConfig.update({
      where: { id: channelConfigId },
      data,
    });
  }

  async upsertChannelConfig(tenantId, data) {
    return prisma.notificationChannelConfig.upsert({
      where: {
        tenantId_channelType_providerName: {
          tenantId,
          channelType: data.channelType,
          providerName: data.providerName,
        },
      },
      update: data,
      create: { tenantId, ...data },
    });
  }

  async deleteChannelConfig(tenantId, channelConfigId) {
    return prisma.notificationChannelConfig.delete({
      where: { id: channelConfigId, tenantId },
    });
  }

  async getChannelConfigs(tenantId, channelType = null) {
    return prisma.notificationChannelConfig.findMany({
      where: {
        tenantId,
        ...(channelType ? { channelType } : {}),
      },
      orderBy: { priority: 'desc' },
    });
  }

  async createEscalationPolicy(tenantId, data) {
    return prisma.escalationPolicy.create({
      data: {
        tenantId,
        ...data,
        rules: data.rules ? { create: data.rules } : undefined,
      },
      include: { rules: true },
    });
  }

  async updateEscalationPolicy(tenantId, policyId, data) {
    return prisma.escalationPolicy.update({
      where: { id: policyId, tenantId },
      data: {
        ...data,
        rules: data.rules
          ? {
              deleteMany: {},
              create: data.rules,
            }
          : undefined,
      },
      include: { rules: true },
    });
  }

  async deleteEscalationPolicy(tenantId, policyId) {
    return prisma.escalationPolicy.delete({
      where: { id: policyId, tenantId },
    });
  }

  async getEscalationPolicies(tenantId, triggerType = null) {
    return prisma.escalationPolicy.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(triggerType ? { triggerType } : {}),
      },
      include: { rules: { orderBy: { level: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createReminderRule(tenantId, data) {
    return prisma.reminderRule.create({
      data: { tenantId, ...data },
    });
  }

  async updateReminderRule(tenantId, ruleId, data) {
    return prisma.reminderRule.update({
      where: { id: ruleId },
      data,
    });
  }

  async deleteReminderRule(tenantId, ruleId) {
    return prisma.reminderRule.delete({
      where: { id: ruleId, tenantId },
    });
  }

  async getReminderRules(tenantId, reminderType = null) {
    return prisma.reminderRule.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(reminderType ? { reminderType } : {}),
      },
      orderBy: { offsetDays: 'asc' },
    });
  }

  async createOptOut(tenantId, data) {
    return prisma.communicationOptOut.create({
      data: { tenantId, ...data },
    });
  }

  async revokeOptOut(tenantId, optOutId) {
    return prisma.communicationOptOut.update({
      where: { id: optOutId, tenantId },
      data: { revokedAt: new Date() },
    });
  }

  async checkOptOut(tenantId, { phoneNumber, email, channel, reminderType }) {
    return prisma.communicationOptOut.findFirst({
      where: {
        tenantId,
        revokedAt: null,
        OR: [phoneNumber ? { phoneNumber } : {}, email ? { email } : {}].filter(Boolean),
        ...(channel ? { OR: [{ channel }, { channel: null }] } : {}),
        ...(reminderType ? { OR: [{ reminderType }, { reminderType: null }] } : {}),
      },
    });
  }

  async getOptOuts(tenantId, { patientId, phoneNumber, channel } = {}) {
    return prisma.communicationOptOut.findMany({
      where: {
        tenantId,
        revokedAt: null,
        ...(patientId ? { patientId } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(channel ? { channel } : {}),
      },
      orderBy: { optedOutAt: 'desc' },
    });
  }

  async createRetryLog(tenantId, data) {
    return prisma.notificationRetryLog.create({
      data: { tenantId, ...data },
    });
  }

  async updateRetryLog(tenantId, retryLogId, data) {
    return prisma.notificationRetryLog.update({
      where: { id: retryLogId, tenantId },
      data,
    });
  }

  async getPendingRetries(tenantId) {
    return prisma.notificationRetryLog.findMany({
      where: {
        tenantId,
        status: { in: ['pending', 'retrying'] },
        nextRetryAt: { lte: new Date() },
      },
      orderBy: { nextRetryAt: 'asc' },
    });
  }

  async getDLQEntries(tenantId) {
    return prisma.notificationRetryLog.findMany({
      where: {
        tenantId,
        status: 'dlq',
      },
      orderBy: { movedToDLQAt: 'desc' },
    });
  }

  async recordChannelDelivery(tenantId, channelConfigId, success) {
    return prisma.notificationChannelConfig.update({
      where: { id: channelConfigId, tenantId },
      data: {
        totalSent: { increment: success ? 1 : 0 },
        totalFailed: { increment: success ? 0 : 1 },
        lastUsedAt: new Date(),
      },
    });
  }
}

export default new NotificationSettingsRepository();
