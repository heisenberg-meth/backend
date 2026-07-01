import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AuditService {
  /**
   * Log a sensitive action
   * @param {Object} data - Audit details
   * @param {Object} [tx] - Prisma transaction client (optional)
   */
  async logAction({ tenantId, userId, entityType, entityId, action }, tx) {
    try {
      const client = tx || prisma;
      await client.auditLog.create({
        data: {
          tenantId,
          userId,
          action: action || 'UPDATE',
          target: entityId || entityType || 'SYSTEM',
          type: 'SYSTEM',
        },
      });
    } catch (error) {
      logger.error({ error }, '[AUDIT_SERVICE] Failed to log action');
    }
  }
}

export default new AuditService();
