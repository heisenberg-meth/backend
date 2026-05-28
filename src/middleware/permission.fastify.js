export const requirePermission = (permissionName) => {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Authentication required', code: 'AUTH_REQUIRED' },
      });
    }

    if (request.user.role === 'ADMIN' || request.user.role === 'OWNER') {
      return;
    }

    if (!request.user.assignedRole) {
      return reply.code(403).send({
        success: false,
        error: { message: 'Access denied. No role assigned.', code: 'NO_ROLE' },
      });
    }

    const hasPermission = request.user.assignedRole.permissions.some(
      (rp) => rp.permission.name === permissionName,
    );

    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `Access denied. Required permission: ${permissionName}`,
          code: 'PERMISSION_DENIED',
        },
      });
    }
  };
};
