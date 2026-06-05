import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

/**
 * Settings Audit Log Repository
 * Records all changes to settings for compliance and audit trails.
 */
class SettingsAuditRepository {
  async logChange({
    tenantId,
    settingKey,
    action,
    category = null,
    branchId = null,
    oldValue = null,
    newValue,
    changedBy = null,
    ipAddress = null,
    userAgent = null,
  }) {
    try {
      const auditLog = await prisma.settingsAuditLog.create({
        data: {
          tenantId,
          settingKey,
          action,
          category,
          branchId,
          oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
          newValue: JSON.parse(JSON.stringify(newValue)),
          changedBy,
          ipAddress,
          userAgent,
        },
      });

      logger.info(
        { tenantId, settingKey, action, category, changedBy },
        'Settings audit log created',
      );

      return auditLog;
    } catch (error) {
      logger.error({ error, tenantId, settingKey }, 'Failed to create settings audit log');
      throw error;
    }
  }

  async getAuditHistory(tenantId, { settingKey, branchId, limit = 50, offset = 0 } = {}) {
    const where = { tenantId };
    if (settingKey) where.settingKey = settingKey;
    if (branchId) where.branchId = branchId;

    return prisma.settingsAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: { select: { fullName: true, email: true, role: true } },
        branch: { select: { name: true, code: true } },
      },
    });
  }

  async getAuditCount(tenantId, { settingKey } = {}) {
    const where = { tenantId };
    if (settingKey) where.settingKey = settingKey;
    return prisma.settingsAuditLog.count({ where });
  }
}

export default new SettingsAuditRepository();
