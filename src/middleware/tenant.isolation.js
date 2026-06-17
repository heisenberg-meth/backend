/**
 * Tenant Isolation Middleware
 * Automatically injects tenantId into request context and validates tenant access
 * Prevents IDOR (Insecure Direct Object Reference) vulnerabilities
 */

export const tenantIsolation = async (request, reply) => {
  // Ensure tenantId is set from authenticated user
  if (!request.tenantId && request.user?.tenantId) {
    request.tenantId = request.user.tenantId;
  }

  if (!request.tenantId) {
    return reply.code(403).send({
      success: false,
      error: {
        message: 'Tenant context required',
        code: 'TENANT_REQUIRED',
      },
    });
  }

  // Attach tenantId to request for easy access in handlers
  request.filter = {
    ...request.filter,
    tenantId: request.tenantId,
  };
};

/**
 * Helper to add tenantId filter to Prisma queries
 * Usage: const items = await prisma.item.findMany(addTenantFilter(request, { status: 'ACTIVE' }));
 */
export const addTenantFilter = (request, where = {}) => {
  return {
    ...where,
    tenantId: request.tenantId,
  };
};

/**
 * Helper to add tenantId to create operations
 * Usage: const item = await prisma.item.create({ data: addTenantData(request, { name: 'Test' }) });
 */
export const addTenantData = (request, data = {}) => {
  return {
    ...data,
    tenantId: request.tenantId,
  };
};

/**
 * Middleware to validate that a resource belongs to the current tenant
 * Usage: fastify.get('/:id', { preHandler: [validateTenantAccess('Invoice')] }, handler)
 */
export const validateTenantAccess = (modelName) => {
  return async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId;

    if (!id || !tenantId) {
      return reply.code(400).send({
        success: false,
        error: {
          message: 'Missing required parameters',
          code: 'MISSING_PARAMETERS',
        },
      });
    }

    // This will be called with Prisma client
    // The actual validation should be done in the service layer
    request.validateTenantAccess = async (prisma) => {
      const resource = await prisma[modelName].findUnique({
        where: { id },
        select: { tenantId: true },
      });

      if (!resource) {
        throw new Error('Resource not found');
      }

      if (resource.tenantId !== tenantId) {
        throw new Error('Access denied: Resource belongs to another tenant');
      }

      return resource;
    };
  };
};

export default {
  tenantIsolation,
  addTenantFilter,
  addTenantData,
  validateTenantAccess,
};
