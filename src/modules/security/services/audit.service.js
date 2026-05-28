import prisma from '../../../config/prisma.js';
import crypto from 'crypto';

class AuditService {
  /**
   * Log action with integrity checksum
   */
  async logSecureAction(tenantId, _userId, actionType, entityType, entityId, metadata) {
    // Generate a simple chain hash to simulate immutability
    const lastLog = await prisma.securityAuditLog.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    
    const prevHash = lastLog ? lastLog.checksum : '0';
    const checksum = crypto
      .createHash('sha256')
      .update(prevHash + actionType + entityId + JSON.stringify(metadata))
      .digest('hex');

    return await prisma.securityAuditLog.create({
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
