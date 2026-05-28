import prisma from '../config/prisma.js';
import logger from '../shared/utils/logger.js';

export const authenticate = async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    logger.error({ err }, '[AUTH] Invalid or expired token');
    return reply.code(401).send({
      success: false,
      error: { message: 'Invalid or expired token', code: 'TOKEN_INVALID' },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: request.user.userId },
    include: {
      tenant: true,
      assignedRole: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!user) {
    return reply.code(401).send({
      success: false,
      error: { message: 'User not found', code: 'USER_NOT_FOUND' },
    });
  }

  request.user = user;
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
