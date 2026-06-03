import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import prisma from '../../../config/prisma.js';
import { invalidateSessionCache } from './auth.cache.js';

class SessionService {
  hashToken(raw) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

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
    const tokenHash = this.hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return prisma.userSession.create({
      data: {
        userId,
        refreshToken: tokenHash,
        fingerprintHash,
        deviceName: deviceName || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt,
      },
    });
  }

  async revokeOtherSessions(userId, currentSessionId) {
    const sessions = await prisma.userSession.findMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revoked: false,
      },
      select: { id: true },
    });

    await prisma.userSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revoked: true },
    });

    sessions.forEach((s) => invalidateSessionCache(s.id));
  }

  async revokeSession(sessionId) {
    const result = await prisma.userSession.update({
      where: { id: sessionId },
      data: { revoked: true },
    });
    invalidateSessionCache(sessionId);
    return result;
  }

  async revokeAllUserSessions(userId) {
    const sessions = await prisma.userSession.findMany({
      where: { userId, revoked: false },
      select: { id: true },
    });

    await prisma.userSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revoked: true },
    });

    sessions.forEach((s) => invalidateSessionCache(s.id));
  }

  async findSessionByRefreshToken(refreshToken) {
    const hash = this.hashToken(refreshToken);

    const session = await prisma.userSession.findUnique({
      where: { refreshToken: hash },
    });

    return session;
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
        refreshToken: this.hashToken(newRefreshToken),
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
