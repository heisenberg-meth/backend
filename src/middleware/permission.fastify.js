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

    const perms = Array.isArray(permissionName) ? permissionName : [permissionName];
    const hasPermission = request.user.assignedRole.permissions.some((rp) =>
      perms.includes(rp.permission.name),
    );

    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `Access denied. Required permission: ${Array.isArray(permissionName) ? permissionName.join(' or ') : permissionName}`,
          code: 'PERMISSION_DENIED',
        },
      });
    }
  };
};
