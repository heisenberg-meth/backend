import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AuditService {
  /**
   * Log a sensitive action
   * @param {Object} data - Audit details
   */
  async logAction({ tenantId, userId, entityType, entityId, action, previousData, newData, ipAddress, userAgent }) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType,
          entityId,
          action,
          previousData: previousData || {},
          newData: newData || {},
          ipAddress,
          user_agent: userAgent,
        },
      });
    } catch (error) {
      logger.error({ error }, '[AUDIT_SERVICE] Failed to log action');
      // Do not throw to avoid blocking the main business transaction
    }
  }
}

export default new AuditService();
