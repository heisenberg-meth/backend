import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import teamService from '../hr/services/team.service.js';

async function teamRoutes(fastify) {
  // Apply authentication and tenant verification hooks to all routes in this plugin
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // Custom local middleware helper to require ADMIN or OWNER roles
  const requireAdmin = async (request) => {
    if (!['ADMIN', 'OWNER'].includes(request.user.role)) {
      const error = new Error('Access denied. Required role: ADMIN');
      error.statusCode = 403;
      throw error;
    }
  };

  // ===================== SHIFT ROUTES =====================

  // GET /shifts - list all shifts with filters
  fastify.get(
    '/shifts',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get shifts with filters',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            branchId: { type: 'string' },
            role: { type: 'string' },
            status: {
              type: 'string',
              enum: ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'MISSED', 'OPEN', 'CLOSED'],
            },
            fromDate: { type: 'string', format: 'date-time' },
            toDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId, branchId, role, status, fromDate, toDate } = request.query;
      const shifts = await teamService.getShifts(request.tenantId, {
        userId,
        branchId,
        role,
        status,
        fromDate,
        toDate,
      });
      return reply.send({ success: true, data: shifts });
    },
  );

  // POST /shifts - create a scheduled shift (admin creates for employee)
  fastify.post(
    '/shifts',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Create a scheduled shift for an employee',
        body: {
          type: 'object',
          required: ['employeeId', 'shiftStart', 'shiftEnd'],
          properties: {
            employeeId: { type: 'string' },
            branchId: { type: 'string' },
            shiftStart: { type: 'string', format: 'date-time' },
            shiftEnd: { type: 'string', format: 'date-time' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const shift = await teamService.createShift(request.tenantId, request.body, request.user.id);
      return reply.code(201).send({ success: true, data: shift });
    },
  );

  // POST /shifts/start - start shift for logged-in user (self-check-in)
  fastify.post(
    '/shifts/start',
    {
      schema: {
        tags: ['Team'],
        summary: 'Start a new work shift (self check-in)',
        body: {
          type: 'object',
          properties: {
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const shift = await teamService.startShift(
        request.tenantId,
        request.user.id,
        request.body?.notes,
      );
      return reply.code(201).send({ success: true, data: shift });
    },
  );

  // GET /shifts/active - get currently active shifts
  fastify.get(
    '/shifts/active',
    {
      schema: {
        tags: ['Team'],
        summary: 'Get all currently active shifts',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { branchId } = request.query;
      const shifts = await teamService.getActiveShifts(request.tenantId, branchId);
      return reply.send({ success: true, data: shifts });
    },
  );

  // PUT /shifts/:id/end - end shift
  fastify.put(
    '/shifts/:id/end',
    {
      schema: {
        tags: ['Team'],
        summary: 'End an active work shift',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const shift = await teamService.endShift(request.tenantId, id);
      return reply.send({ success: true, data: shift });
    },
  );

  // ===================== PERFORMANCE ROUTES =====================

  // GET /performance - current user performance
  fastify.get(
    '/performance',
    {
      schema: {
        tags: ['Team'],
        summary: 'Get current user performance metrics',
      },
    },
    async (request, reply) => {
      const performance = await teamService.getPerformance(request.tenantId, request.user.id);
      return reply.send({ success: true, data: performance });
    },
  );

  // GET /performance/overview - team-wide performance overview
  fastify.get(
    '/performance/overview',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get team-wide performance overview',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
            role: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { branchId, role } = request.query;
      const performance = await teamService.getTeamPerformanceOverview(request.tenantId, {
        branchId,
        role,
      });
      return reply.send({ success: true, data: performance });
    },
  );

  // GET /:id/performance - get specific user performance
  fastify.get(
    '/:id/performance',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get specific user performance',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const performance = await teamService.getPerformance(request.tenantId, id);
      return reply.send({ success: true, data: performance });
    },
  );

  // ===================== BILLING PERFORMANCE =====================

  // GET /billing-performance - cashier billing performance
  fastify.get(
    '/billing-performance',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get cashier billing performance metrics',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
            fromDate: { type: 'string', format: 'date-time' },
            toDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const { branchId, fromDate, toDate } = request.query;
      const performance = await teamService.getBillingPerformance(request.tenantId, {
        branchId,
        fromDate,
        toDate,
      });
      return reply.send({ success: true, data: performance });
    },
  );

  // ===================== CRUD TEAM ROUTES =====================

  // GET / - list all team members
  fastify.get(
    '/',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get all team members',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            search: { type: 'string' },
            role: { type: 'string' },
            branchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { page, limit, search, role, branchId } = request.query;
      const result = await teamService.getTeamMembers({
        tenantId: request.tenantId,
        search,
        role,
        branchId,
        skip: page ? (parseInt(page) - 1) * parseInt(limit || 20) : 0,
        take: parseInt(limit) || 20,
      });

      const mappedMembers = result.members.map((member) => ({
        ...member,
        _id: member.id,
        branch: member.branch ? { ...member.branch, _id: member.branch.id } : null,
      }));

      return reply.send({
        success: true,
        data: {
          ...result,
          members: mappedMembers,
        },
      });
    },
  );

  // POST / - create a team member
  fastify.post(
    '/',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Create a new team member',
        body: {
          type: 'object',
          required: ['email', 'password', 'fullName', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['OWNER', 'STAFF', 'ADMIN', 'PHARMACIST', 'CASHIER'] },
            phone: { type: 'string' },
            branchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const member = await teamService.createTeamMember({
        ...request.body,
        tenantId: request.tenantId,
        createdBy: request.user.id,
      });

      const mapped = {
        ...member,
        _id: member.id,
        branch: member.branch ? { ...member.branch, _id: member.branch.id } : null,
      };

      return reply.code(201).send({ success: true, data: mapped });
    },
  );

  // GET /:id - get team member by ID
  fastify.get(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get team member by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const member = await teamService.getTeamMemberById(id, request.tenantId);

      const mapped = {
        ...member,
        _id: member.id,
        branch: member.branch ? { ...member.branch, _id: member.branch.id } : null,
      };

      return reply.send({ success: true, data: mapped });
    },
  );

  // PUT /:id - update team member
  fastify.put(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Update team member information',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['OWNER', 'STAFF', 'ADMIN', 'PHARMACIST', 'CASHIER'] },
            phone: { type: 'string' },
            branchId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const member = await teamService.updateTeamMember(id, request.tenantId, request.body);

      const mapped = {
        ...member,
        _id: member.id,
        branch: member.branch ? { ...member.branch, _id: member.branch.id } : null,
      };

      return reply.send({ success: true, data: mapped });
    },
  );

  // POST /:id/avatar - upload team member avatar
  fastify.post('/:id/avatar', {
    schema: {
      tags: ['Team'],
      summary: 'Upload team member avatar',
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ success: false, error: { message: 'No file uploaded' } });
      }
      const avatarUrl = `/avatars/${id}_${Date.now()}`;
      return reply.send({ success: true, data: { avatarUrl } });
    },
  });

  // DELETE /:id - delete team member
  fastify.delete(
    '/:id',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Delete/deactivate a team member',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      await teamService.deleteTeamMember(id, request.tenantId);
      return reply.send({ success: true, message: 'Team member deleted successfully' });
    },
  );

  // ===================== PERMISSION MANAGEMENT =====================

  // GET /:id/permissions - get team member's permissions
  fastify.get(
    '/:id/permissions',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Get team member permissions',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const permissions = await teamService.getTeamMemberPermissions(request.tenantId, id);
      return reply.send({ success: true, data: permissions });
    },
  );

  // PATCH /:id/permissions - update granular permissions
  fastify.patch(
    '/:id/permissions',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Update team member permissions',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['permissions'],
          properties: {
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { permissions } = request.body;
      const result = await teamService.updateTeamMemberPermissions(
        request.tenantId,
        id,
        permissions,
        request.user.id,
      );
      return reply.send({ success: true, data: result });
    },
  );

  // PUT /:id/permissions - update team member role (legacy, kept for compat)
  fastify.put(
    '/:id/permissions',
    {
      preHandler: requireAdmin,
      schema: {
        tags: ['Team'],
        summary: 'Update team member role',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['role'],
          properties: {
            role: { type: 'string', enum: ['OWNER', 'STAFF', 'ADMIN', 'PHARMACIST', 'CASHIER'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { role } = request.body;
      const member = await teamService.updateTeamMemberRole(id, request.tenantId, role);

      const mapped = {
        ...member,
        _id: member.id,
        branch: member.branch ? { ...member.branch, _id: member.branch.id } : null,
      };

      return reply.send({ success: true, data: mapped });
    },
  );
}

export default teamRoutes;
