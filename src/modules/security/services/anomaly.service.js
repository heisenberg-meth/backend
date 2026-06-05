import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

class AnomalyService {
  /**
   * Analyze audit logs for suspicious patterns
   */
  async detectSuspiciousActivity(tenantId) {
    // Basic heuristic: detect multiple unauthorized access attempts in short time
    const threshold = 5;
    const recentDenials = await prisma.auditLog.count({
      where: {
        tenantId,
        entityType: 'AUTHORIZATION',
        action: 'DENIED',
        date: { gte: new Date(Date.now() - 300000) }, // last 5 mins
      },
    });

    if (recentDenials > threshold) {
      logger.warn(
        { tenantId, count: recentDenials },
        '[ANOMALY_SERVICE] Suspicious activity detected',
      );
      return { suspicious: true, message: 'High volume of authorization denials.' };
    }

    return { suspicious: false };
  }
}

export default new AnomalyService();
