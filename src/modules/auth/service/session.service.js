import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import prisma from '../../../config/prisma.js';
import redis from '../../../config/redis.js';
import { invalidateSessionCache } from './auth.cache.js';
import logger from '../../../shared/utils/logger.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';

const MAX_CONCURRENT_SESSIONS = 5;
const SESSION_CACHE_PREFIX = 'session:';

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

    // Enforce max concurrent sessions — revoke oldest if over limit
    const activeSessions = await prisma.userSession.findMany({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (activeSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const sessionsToRevoke = activeSessions.slice(
        0,
        activeSessions.length - MAX_CONCURRENT_SESSIONS + 1,
      );
      const revokeIds = sessionsToRevoke.map((s) => s.id);

      await prisma.userSession.updateMany({
        where: { id: { in: revokeIds } },
        data: { revoked: true },
      });

      revokeIds.forEach((id) => invalidateSessionCache(id));
      logger.info(
        { userId, revokedCount: revokeIds.length },
        'Evicted old sessions for max concurrent limit',
      );
    }

    const session = await prisma.userSession.create({
      data: {
        userId,
        refreshToken: tokenHash,
        fingerprintHash,
        deviceName: deviceName || null,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt,
        lastActivity: new Date(),
        authVersion: CURRENT_AUTH_VERSION,
      },
    });

    // Cache session in Redis for fast lookups
    try {
      await redis.set(
        `${SESSION_CACHE_PREFIX}${session.id}`,
        JSON.stringify({ userId, valid: true }),
        'EX',
        30 * 24 * 60 * 60, // 30 days
      );
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to cache session in Redis');
    }

    return session;
  }

  async touchSession(sessionId) {
    try {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { lastActivity: new Date() },
      });
    } catch (err) {
      logger.warn({ err: err.message, sessionId }, 'Failed to update session lastActivity');
    }
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

    sessions.forEach((s) => {
      invalidateSessionCache(s.id);
      redis.del(`${SESSION_CACHE_PREFIX}${s.id}`).catch(() => {});
    });
  }

  async revokeSession(sessionId) {
    const result = await prisma.userSession.update({
      where: { id: sessionId },
      data: { revoked: true },
    });
    invalidateSessionCache(sessionId);
    redis.del(`${SESSION_CACHE_PREFIX}${sessionId}`).catch(() => {});
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

    sessions.forEach((s) => {
      invalidateSessionCache(s.id);
      redis.del(`${SESSION_CACHE_PREFIX}${s.id}`).catch(() => {});
    });
  }

  async revokeUserSessionsByDevice(userId, fingerprintHash) {
    if (!fingerprintHash) return;
    const sessions = await prisma.userSession.findMany({
      where: { userId, fingerprintHash, revoked: false },
      select: { id: true },
    });

    await prisma.userSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revoked: true },
    });

    sessions.forEach((s) => {
      invalidateSessionCache(s.id);
      redis.del(`${SESSION_CACHE_PREFIX}${s.id}`).catch(() => {});
    });
  }

  async findSessionById(sessionId) {
    return prisma.userSession.findUnique({
      where: { id: sessionId },
    });
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
        lastActivity: new Date(),
        authVersion: CURRENT_AUTH_VERSION,
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
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastActivity: true,
        expiresAt: true,
      },
    });
  }
}

export default new SessionService();
