import controller from '../controllers/support.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/dashboard', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Get admin ticket dashboard',
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
          status: { type: 'string' },
          priority: { type: 'string' },
          category: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      try {
        const { page = 1, limit = 20, status, priority, category } = request.query;
        const where = {
          tenantId: request.tenantId,
          ...(status ? { status } : {}),
          ...(priority ? { priority } : {}),
          ...(category ? { category } : {}),
        };

        const [tickets, total] = await Promise.all([
          prisma.supportTicket.findMany({
            where,
            include: {
              createdBy: { select: { id: true, fullName: true, email: true } },
              assignedTo: { select: { id: true, fullName: true, email: true } },
              _count: { select: { messages: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.supportTicket.count({ where }),
        ]);

        return reply.send({
          success: true,
          data: tickets,
          pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Get tickets failed');
        return reply.code(500).send({ success: false, error: 'Failed to fetch tickets' });
      }
    },
  });

  fastify.put('/tickets/:ticketId/assign', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Assign ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['assignedTo'],
        properties: { assignedTo: { type: 'string' } },
      },
    },
    handler: async (request, reply) => {
      try {
        const { ticketId } = request.params;
        const { assignedTo } = request.body;

        const ticket = await prisma.supportTicket.findFirst({
          where: { id: ticketId, tenantId: request.tenantId },
        });

        if (!ticket) {
          return reply.code(404).send({ success: false, error: 'Ticket not found' });
        }

        await prisma.supportTicket.update({
          where: { id: ticketId },
          data: { assignedToId: assignedTo, status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status },
        });

        await prisma.supportAuditLog.create({
          data: {
            ticketId,
            action: 'ASSIGNED',
            oldValue: ticket.assignedToId,
            newValue: assignedTo,
            performedBy: request.user.id,
          },
        });

        return reply.send({ success: true });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Assign ticket failed');
        return reply.code(500).send({ success: false, error: 'Failed to assign ticket' });
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
        properties: { ticketId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_STAFF', 'RESOLVED', 'CLOSED'] } },
      },
    },
    handler: async (request, reply) => {
      try {
        const { ticketId } = request.params;
        const { status } = request.body;

        const ticket = await prisma.supportTicket.findFirst({
          where: { id: ticketId, tenantId: request.tenantId },
        });

        if (!ticket) {
          return reply.code(404).send({ success: false, error: 'Ticket not found' });
        }

        const updateData = { status };
        if (status === 'RESOLVED') updateData.resolvedAt = new Date();
        if (status === 'CLOSED') updateData.closedAt = new Date();

        await prisma.supportTicket.update({ where: { id: ticketId }, data: updateData });

        await prisma.supportAuditLog.create({
          data: {
            ticketId,
            action: 'STATUS_CHANGED',
            oldValue: ticket.status,
            newValue: status,
            performedBy: request.user.id,
          },
        });

        return reply.send({ success: true });
      } catch (error) {
        logger.error({ error }, '[ADMIN SUPPORT] Update status failed');
        return reply.code(500).send({ success: false, error: 'Failed to update status' });
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

  fastify.put('/tickets/:ticketId/resolve', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Resolve ticket',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['resolution'],
        properties: { resolution: { type: 'string' } },
      },
    },
    handler: controller.resolveTicket,
  });

  fastify.get('/tickets/:ticketId', {
    schema: {
      tags: ['Admin Support'],
      summary: 'Get ticket details (admin)',
      params: {
        type: 'object',
        required: ['ticketId'],
        properties: { ticketId: { type: 'string' } },
      },
    },
    handler: controller.getTicketDetails,
  });
}
