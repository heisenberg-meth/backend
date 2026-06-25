import prisma from '../config/prisma.js';
import logger from '../shared/utils/logger.js';
import { sessionCache, userCache } from '../modules/auth/service/auth.cache.js';
import sessionService from '../modules/auth/service/session.service.js';
import { CURRENT_AUTH_VERSION } from '../modules/auth/auth.constants.js';
import { compareVersions } from '../modules/auth/auth.version.js';

const SESSION_CACHE_TTL_MS = 30_000;
const USER_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 500;
const USER_CACHE_MAX = 500;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

async function verifySession(sessionId) {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { revoked: true, expiresAt: true, authVersion: true },
  });
  if (!session || session.revoked || new Date() > session.expiresAt) return null;

  const versionDiff = compareVersions(session.authVersion, CURRENT_AUTH_VERSION);
  if (versionDiff < 0) {
    logger.info(
      { sessionId, sessionVersion: session.authVersion, currentVersion: CURRENT_AUTH_VERSION },
      'Session version outdated - will be upgraded on next refresh',
    );
  } else if (versionDiff > 0) {
    logger.warn(
      { sessionId, sessionVersion: session.authVersion, currentVersion: CURRENT_AUTH_VERSION },
      'Session from future version rejected',
    );
    return null;
  }

  return session;
}

async function fetchAndCacheUser(userId) {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: true,
      assignedRole: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (user) {
    if (userCache.size >= USER_CACHE_MAX) {
      const oldest = userCache.keys().next().value;
      userCache.delete(oldest);
    }
    userCache.set(userId, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  }

  return user;
}

export const authenticate = async (request, reply) => {
  // Priority: Authorization header > accessToken cookie
  // Only use cookie if no Authorization header is provided
  const cookieToken = request.cookies?.accessToken;
  if (!request.headers.authorization && cookieToken) {
    request.headers.authorization = `Bearer ${cookieToken}`;
  }

  if (!request.headers.authorization) {
    logger.warn(
      {
        url: request.url,
        hasCookies: !!request.cookies,
        cookieNames: Object.keys(request.cookies || {}),
      },
      '[AUTH] No Authorization header or accessToken cookie found',
    );
    return reply.code(401).send({
      success: false,
      error: { message: 'No authorization provided', code: 'NO_AUTH' },
    });
  }

  try {
    await request.jwtVerify();
  } catch (err) {
    const isExpired = err.message?.toLowerCase().includes('expired');
    request.log.warn(
      {
        event: isExpired ? 'AUTH_EXPIRED_TOKEN' : 'AUTH_INVALID_TOKEN',
        error: err.message,
        url: request.url,
        ip: request.ip,
      },
      'Token validation failed',
    );
    return reply.code(401).send({
      success: false,
      error: { message: 'Invalid or expired token', code: 'TOKEN_INVALID' },
    });
  }

  const { sessionId } = request.user;
  if (!sessionId) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Session ID missing from token', code: 'SESSION_ID_MISSING' },
    });
  }

  const cached = sessionCache.get(sessionId);
  const sessionValid =
    cached && cached.expiresAt > Date.now()
      ? cached.valid
      : (await verifySession(sessionId, request.user.userId)) !== null;

  if (!sessionValid) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Session revoked or expired', code: 'SESSION_INVALID' },
    });
  }

  if (!cached || cached.expiresAt <= Date.now()) {
    if (sessionCache.size >= SESSION_CACHE_MAX) {
      const oldest = sessionCache.keys().next().value;
      sessionCache.delete(oldest);
    }
    sessionCache.set(sessionId, { valid: true, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
  }

  const lastTouchKey = `lastTouch:${sessionId}`;
  const lastTouch = sessionCache.get(lastTouchKey);
  if (!lastTouch || Date.now() - lastTouch > TOUCH_INTERVAL_MS) {
    sessionCache.set(lastTouchKey, Date.now());
    sessionService.touchSession(sessionId).catch(() => {});
  }

  const user = await fetchAndCacheUser(request.user.userId);

  if (!user) {
    return reply.code(401).send({
      success: false,
      error: { message: 'User not found', code: 'USER_NOT_FOUND' },
    });
  }

  if (user.status === 'BLOCKED') {
    return reply.code(403).send({
      success: false,
      error: { message: 'Your account has been blocked', code: 'USER_BLOCKED' },
    });
  }

  if (user.status === 'SUSPENDED') {
    return reply.code(403).send({
      success: false,
      error: { message: 'Your account has been suspended', code: 'USER_SUSPENDED' },
    });
  }

  if (user.tenant?.blacklisted) {
    return reply.code(403).send({
      success: false,
      error: { message: 'Your organization has been blocked', code: 'TENANT_BLACKLISTED' },
    });
  }

  if (user.tenant?.status === 'SUSPENDED') {
    return reply.code(403).send({
      success: false,
      error: { message: 'Your organization has been suspended', code: 'TENANT_SUSPENDED' },
    });
  }

  if (user.tenant?.status === 'EXPIRED') {
    return reply.code(403).send({
      success: false,
      error: { message: 'Your subscription has expired', code: 'SUBSCRIPTION_EXPIRED' },
    });
  }

  request.user = user;
  request.sessionId = sessionId;
  request.tenantId = user.tenantId;
  request.branchId = user.branchId;
};

export const requireSession = async (request, reply) => {
  const sessionId = request.headers['x-session-id'];
  if (!sessionId) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Session ID required', code: 'SESSION_ID_REQUIRED' },
    });
  }

  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.revoked) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Session revoked or not found', code: 'SESSION_INVALID' },
    });
  }

  if (new Date() > session.expiresAt) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Session expired', code: 'SESSION_EXPIRED' },
    });
  }

  request.session = session;
};

export const requireTenant = async (request) => {
  if (!request.tenantId) {
    const error = new Error('Tenant context required');
    error.statusCode = 403;
    throw error;
  }
};
