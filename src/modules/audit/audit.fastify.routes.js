import prisma from '../../config/prisma.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function auditRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/',
    {
      preHandler: requirePermission('audit:read'),
      schema: {
        tags: ['Audit'],
        summary: 'List audit logs',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            type: { type: 'string' },
            action: { type: 'string' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (request, reply) => {
      const { page = 1, limit = 50, type, action, startDate, endDate } = request.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = { tenantId: request.tenantId };
      if (type) where.type = type;
      if (action) where.action = action;
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { date: 'desc' },
          skip,
          take,
          include: { user: { select: { id: true, fullName: true, email: true } } },
        }),
        prisma.auditLog.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: logs,
        pagination: {
          total,
          page: parseInt(page),
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      });
    },
  );
}

export default auditRoutes;
