import { mainQueue } from '../../../queue/index.js';

class AuditPrismaService {
  /**
   * Log an audit action asynchronously via BullMQ
   */
  async log(data) {
    const { tenantId, userId, action, target, type, username, shopName } = data;

    await mainQueue.add('log-audit', {
      tenantId,
      userId,
      username,
      shopName,
      action,
      target,
      type: type || 'INVENTORY',
    });
  }
}

export default new AuditPrismaService();
