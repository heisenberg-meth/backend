import prisma from '../../../config/prisma.js';
import crypto from 'crypto';

class AuditService {
  /**
   * Log action with integrity checksum
   * @param {Object} [tx] - Prisma transaction client (optional)
   */
  async logSecureAction(tenantId, _userId, actionType, entityType, entityId, metadata, tx) {
    const client = tx || prisma;

    const lastLog = await client.securityAuditLog.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    
    const prevHash = lastLog ? lastLog.checksum : '0';
    const checksum = crypto
      .createHash('sha256')
      .update(prevHash + actionType + entityId + JSON.stringify(metadata))
      .digest('hex');

    return await client.securityAuditLog.create({
      data: {
        tenantId,
        actionType,
        entityType,
        entityId,
        metadata,
        checksum
      }
    });
  }
}

export default new AuditService();
