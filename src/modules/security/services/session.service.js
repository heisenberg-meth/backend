import prisma from '../../../config/prisma.js';

class SessionService {
  /**
   * Track a new session
   */
  async createSession(userId, refreshTokenHash, ipAddress, deviceInfo, expiresInSeconds) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return await prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash,
        ipAddress,
        deviceInfo,
        expiresAt,
      },
    });
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId) {
    return await prisma.userSession.update({
      where: { id: sessionId },
      data: { revoked: true },
    });
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    return await prisma.userSession.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }],
      },
    });
  }
}

export default new SessionService();
