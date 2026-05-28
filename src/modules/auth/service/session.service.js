import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import prisma from '../../../config/prisma.js';

class SessionService {
  hashFingerprint(fingerprint) {
    if (!fingerprint) return null;
    const raw = typeof fingerprint === 'string' ? fingerprint : JSON.stringify(fingerprint);
    return CryptoJS.SHA256(raw).toString();
  }

  generateDeviceToken() {
    return crypto.randomUUID();
  }

  async createSession({ userId, refreshToken, fingerprint, deviceName, userAgent, ipAddress }) {
    const fingerprintHash = this.hashFingerprint(fingerprint);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return prisma.userSession.create({
      data: {
        userId,
        refreshToken,
        fingerprintHash,
        deviceName: deviceName || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt,
      },
    });
  }

  async revokeOtherSessions(userId, currentSessionId) {
    await prisma.userSession.updateMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revoked: false,
      },
      data: { revoked: true },
    });
  }

  async revokeSession(sessionId) {
    return prisma.userSession.update({
      where: { id: sessionId },
      data: { revoked: true },
    });
  }

  async revokeAllUserSessions(userId) {
    await prisma.userSession.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async findSessionByRefreshToken(refreshToken) {
    return prisma.userSession.findUnique({
      where: { refreshToken },
    });
  }

  async findActiveSessionByUser(userId) {
    return prisma.userSession.findFirst({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async rotateRefreshToken(sessionId, newRefreshToken) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshToken: newRefreshToken,
        expiresAt,
      },
    });
  }

  async getActiveSessions(userId) {
    return prisma.userSession.findMany({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });
  }
}

export default new SessionService();
