import prisma from '../../../config/prisma.js';

const ADMIN_ROLE_HIERARCHY = {
  ROOT_ADMIN: 4,
  ADMIN: 3,
  FINANCE: 2,
  SUPPORT: 1,
  SALES: 1,
};

export const authenticateAdmin = async (request, reply) => {
  const cookieToken = request.cookies?.adminAccessToken;
  if (cookieToken && !request.headers.authorization) {
    request.headers.authorization = `Bearer ${cookieToken}`;
  }

  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({
      success: false,
      error: { message: 'Invalid or expired admin token', code: 'ADMIN_TOKEN_INVALID' },
    });
  }

  const { adminId } = request.user;
  if (!adminId) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Admin ID missing from token', code: 'ADMIN_ID_MISSING' },
    });
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: adminId } });

  if (!admin || !admin.isActive) {
    return reply.code(401).send({
      success: false,
      error: { message: 'Admin not found or deactivated', code: 'ADMIN_UNAUTHORIZED' },
    });
  }

  request.admin = admin;
};

export const requireAdminRole = (...roles) => {
  return async (request, reply) => {
    if (!request.admin) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Admin authentication required', code: 'ADMIN_AUTH_REQUIRED' },
      });
    }

    if (request.admin.role === 'ROOT_ADMIN') return;

    if (!roles.includes(request.admin.role)) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `Access denied. Required role: ${roles.join(' or ')}`,
          code: 'ADMIN_ROLE_DENIED',
        },
      });
    }
  };
};

export const requireAdminPermission = (...permissions) => {
  return async (request, reply) => {
    if (!request.admin) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Admin authentication required', code: 'ADMIN_AUTH_REQUIRED' },
      });
    }

    if (request.admin.role === 'ROOT_ADMIN') return;

    const hasAll = permissions.every((p) => request.admin.permissions.includes(p));
    if (!hasAll) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `Access denied. Missing permissions: ${permissions.join(', ')}`,
          code: 'ADMIN_PERMISSION_DENIED',
        },
      });
    }
  };
};

export const requireAdminLevel = (minimumLevel) => {
  return async (request, reply) => {
    if (!request.admin) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Admin authentication required', code: 'ADMIN_AUTH_REQUIRED' },
      });
    }

    const level = ADMIN_ROLE_HIERARCHY[request.admin.role] || 0;
    if (level < minimumLevel) {
      return reply.code(403).send({
        success: false,
        error: {
          message: 'Access denied. Insufficient admin level.',
          code: 'ADMIN_LEVEL_DENIED',
        },
      });
    }
  };
};
