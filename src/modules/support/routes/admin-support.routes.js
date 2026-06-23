import controller from '../controllers/support.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { adminService } from '../../admin/service/admin.service.js';
import logger from '../../../shared/utils/logger.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/dashboard', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Get admin ticket dashboard with metrics',
    },
    handler: controller.getAdminDashboard,
  });

  fastify.get('/tickets', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Get all tickets (admin)',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          status: {
            type: 'string',
            enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_STAFF', 'RESOLVED', 'CLOSED'],
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          category: {
            type: 'string',
            enum: [
              'INVENTORY',
              'BILLING',
              'PURCHASE',
              'SUPPLIER',
              'SALES',
              'REPORTS',
              'IMPORT',
              'ACCOUNT',
              'TECHNICAL',
              'OTHER',
            ],
          },
          search: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const result = await adminService.listSupportTickets(request.query);
        return reply.send({
          success: true,
          data: result.tickets,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: Math.ceil(result.total / result.limit),
          },
        });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Get tickets failed');
        return reply.code(500).send({ success: false, error: 'Failed to fetch tickets' });
      }
    },
  });

  fastify.get('/tickets/:ticketId', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Get ticket details (admin)',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string', format: 'uuid' } },
      },
    },
    handler: async (request, reply) => {
      try {
        const ticket = await adminService.getSupportTicket(request.params.ticketId);
        return reply.send({ success: true, data: ticket });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Get ticket failed');
        return reply.code(404).send({ success: false, error: error.message });
      }
    },
  });

  fastify.put('/tickets/:ticketId/assign', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Assign ticket to admin',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['assignedTo'],
        properties: { assignedTo: { type: 'string', format: 'uuid' } },
      },
    },
    handler: async (request, reply) => {
      try {
        await adminService.assignTicket(
          request.params.ticketId,
          request.body.assignedTo,
          request.user.id,
        );
        return reply.send({ success: true, message: 'Ticket assigned successfully' });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Assign ticket failed');
        return reply.code(400).send({ success: false, error: error.message });
      }
    },
  });

  fastify.put('/tickets/:ticketId/status', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Update ticket status',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_STAFF', 'RESOLVED', 'CLOSED'],
          },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        await adminService.updateSupportTicketStatus(
          request.params.ticketId,
          request.body.status,
          request.user.id,
        );
        return reply.send({ success: true, message: 'Status updated successfully' });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Update status failed');
        return reply.code(400).send({ success: false, error: error.message });
      }
    },
  });

  fastify.post('/tickets/:ticketId/replies', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Admin reply to ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', minLength: 1 } },
      },
    },
    handler: controller.addReply,
  });

  fastify.put('/tickets/:ticketId/resolve', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Resolve ticket with resolution summary',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['resolution'],
        properties: { resolution: { type: 'string', minLength: 5 } },
      },
    },
    handler: controller.resolveTicket,
  });
}
