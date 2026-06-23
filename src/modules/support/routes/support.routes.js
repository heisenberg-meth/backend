import controller from '../controllers/support.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/', {
    schema: {
      tags: ['Support'],
      summary: 'Create a support ticket',
      body: {
        type: 'object',
        required: ['subject', 'message'],
        properties: {
          subject: { type: 'string' },
          message: { type: 'string' },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
        },
      },
    },
    handler: controller.createTicket,
  });

  fastify.get('/my', {
    schema: {
      tags: ['Support'],
      summary: 'Get my tickets',
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: [
              'OPEN',
              'IN_PROGRESS',
              'WAITING_FOR_STAFF',
              'RESOLVED',
              'CLOSED',
            ],
          },
          priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
    handler: controller.getMyTickets,
  });

  fastify.get('/dashboard', {
    schema: {
      tags: ['Support'],
      summary: 'Get staff ticket dashboard',
    },
    handler: controller.getStaffDashboard,
  });

  fastify.get('/:ticketId', {
    schema: {
      tags: ['Support'],
      summary: 'Get ticket details',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
    },
    handler: controller.getTicketDetails,
  });

  fastify.post('/:ticketId/replies', {
    schema: {
      tags: ['Support'],
      summary: 'Add reply to ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string' } },
      },
    },
    handler: controller.addReply,
  });

  fastify.put('/:ticketId/close', {
    schema: {
      tags: ['Support'],
      summary: 'Close a ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
    },
    handler: controller.closeTicket,
  });

  fastify.put('/:ticketId/reopen', {
    schema: {
      tags: ['Support'],
      summary: 'Reopen a ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string' } },
      },
    },
    handler: controller.reopenTicket,
  });
}
