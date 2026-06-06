import { mainQueue } from '../../../queue/index.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class AuditPrismaService {
  /**
   * Log an audit action asynchronously via BullMQ
   */
  async log(data) {
    const { tenantId, userId, action, target, type, username, shopName } = data;

    try {
      await mainQueue.add('log-audit', {
        tenantId,
        userId,
        username,
        shopName,
        action,
        target,
        type: type || 'INVENTORY',
      });
    } catch (err) {
      logger.warn({ err }, 'BullMQ audit log failed, falling back to direct insert');
      try {
        await prisma.auditLog.create({
          data: {
            tenantId,
            userId,
            username,
            shopName,
            action,
            target,
            type: type || 'INVENTORY',
            date: new Date(),
          },
        });
      } catch (directErr) {
        logger.error({ err: directErr }, 'Direct audit log insert also failed');
      }
    }
  }
}

export default new AuditPrismaService();
