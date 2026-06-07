import prisma from '../config/prisma.js';
import logger from '../shared/utils/logger.js';
import { sessionCache, userCache } from '../modules/auth/service/auth.cache.js';

const SESSION_CACHE_TTL_MS = 30_000;
const USER_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 500;
const USER_CACHE_MAX = 500;

async function verifySession(sessionId) {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { revoked: true, expiresAt: true },
  });
  return session && !session.revoked && new Date() <= session.expiresAt ? session : null;
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
  const cookieToken = request.cookies?.accessToken;
  if (cookieToken && !request.headers.authorization) {
    request.headers.authorization = `Bearer ${cookieToken}`;
  }

  try {
    await request.jwtVerify();
  } catch (err) {
    logger.error({ err }, '[AUTH] Invalid or expired token');
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

  const user = await fetchAndCacheUser(request.user.userId);

  if (!user) {
    return reply.code(401).send({
      success: false,
      error: { message: 'User not found', code: 'USER_NOT_FOUND' },
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
