import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class LoginHistoryService {
  /**
   * Helper to parse basic browser and OS strings from a User-Agent string.
   */
  parseUserAgent(userAgent = '') {
    const ua = userAgent.toLowerCase();
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('edg')) browser = 'Edge';

    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux') && !ua.includes('android')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    return { browser, os };
  }

  /**
   * Records an immutable forensic login audit log.
   */
  async recordLoginEvent({
    userId = null,
    email,
    ipAddress,
    userAgent,
    status = 'SUCCESS',
    failureReason = null,
    headers = {},
  }) {
    try {
      const { browser, os } = this.parseUserAgent(userAgent);
      const country = headers['cf-ipcountry'] || headers['x-country'] || 'Unknown';
      const city = headers['cf-ipcity'] || headers['x-city'] || 'Unknown';

      await prisma.loginHistory.create({
        data: {
          userId,
          email: email?.toLowerCase().trim() || 'unknown',
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          browser,
          os,
          country,
          city,
          status,
          failureReason,
        },
      });
    } catch (error) {
      logger.error({ error, email }, 'Failed to record forensic login history');
    }
  }

  /**
   * Retrieves recent login history for user forensics or admin inspection.
   */
  async getLoginHistory({ userId, email, limit = 50 }) {
    const where = {};
    if (userId) where.userId = userId;
    else if (email) where.email = email.toLowerCase().trim();

    return prisma.loginHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export default new LoginHistoryService();
