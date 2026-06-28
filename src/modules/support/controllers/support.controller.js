import supportService from '../services/support.service.js';
import logger from '../../../shared/utils/logger.js';

class SupportController {
  async createTicket(request, reply) {
    try {
      const { title, description, category, priority } = request.body;

      if (!title || !description) {
        return reply.code(400).send({
          success: false,
          error: 'Title and description are required',
        });
      }

      const ticket = await supportService.createTicket(request.tenantId, request.user.id, {
        title,
        description,
        category,
        priority,
      });

      return reply.code(201).send({ success: true, data: ticket });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Create ticket failed');
      return reply.code(500).send({ success: false, error: 'Failed to create ticket' });
    }
  }

  async getMyTickets(request, reply) {
    try {
      const result = await supportService.getMyTickets(
        request.tenantId,
        request.user.id,
        request.query,
      );
      return reply.send({ success: true, data: result.tickets, pagination: result.pagination });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Get my tickets failed');
      return reply.code(500).send({ success: false, error: 'Failed to fetch tickets' });
    }
  }

  async getTicketDetails(request, reply) {
    try {
      const { ticketId } = request.params;
      const ticket = await supportService.getTicketDetails(
        request.tenantId,
        ticketId,
        request.user.id,
      );

      if (!ticket) {
        return reply.code(404).send({ success: false, error: 'Ticket not found' });
      }

      return reply.send({ success: true, data: ticket });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Get ticket details failed');
      return reply.code(500).send({ success: false, error: 'Failed to fetch ticket' });
    }
  }

  async addReply(request, reply) {
    try {
      const { ticketId } = request.params;
      const { message } = request.body;

      if (!message) {
        return reply.code(400).send({ success: false, error: 'Message is required' });
      }

      await supportService.addReply(request.tenantId, ticketId, request.user.id, message);
      return reply.send({ success: true, message: 'Reply added' });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Add reply failed');
      return reply
        .code(500)
        .send({ success: false, error: error.message || 'Failed to add reply' });
    }
  }

  async resolveTicket(request, reply) {
    try {
      const { ticketId } = request.params;
      const { resolution } = request.body;

      const ticket = await supportService.resolveTicket(
        request.tenantId,
        ticketId,
        request.user.id,
        resolution,
      );

      return reply.send({ success: true, status: ticket.status });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Resolve ticket failed');
      return reply.code(500).send({ success: false, error: 'Failed to resolve ticket' });
    }
  }

  async closeTicket(request, reply) {
    try {
      const { ticketId } = request.params;
      const ticket = await supportService.closeTicket(request.tenantId, ticketId, request.user.id);

      return reply.send({ success: true, status: ticket.status });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Close ticket failed');
      return reply.code(500).send({ success: false, error: 'Failed to close ticket' });
    }
  }

  async reopenTicket(request, reply) {
    try {
      const { ticketId } = request.params;
      const { reason } = request.body;

      if (!reason) {
        return reply.code(400).send({ success: false, error: 'Reason is required' });
      }

      const ticket = await supportService.reopenTicket(
        request.tenantId,
        ticketId,
        request.user.id,
        reason,
      );

      return reply.send({ success: true, status: ticket.status });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Reopen ticket failed');
      return reply.code(500).send({ success: false, error: 'Failed to reopen ticket' });
    }
  }

  async getStaffDashboard(request, reply) {
    try {
      const dashboard = await supportService.getStaffDashboard(request.tenantId, request.user.id);
      return reply.send({ success: true, data: dashboard });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Staff dashboard failed');
      return reply.code(500).send({ success: false, error: 'Failed to fetch dashboard' });
    }
  }

  async getAdminDashboard(request, reply) {
    try {
      const dashboard = await supportService.getAdminDashboard(request.tenantId);
      return reply.send({ success: true, data: dashboard });
    } catch (error) {
      logger.error({ error }, '[SUPPORT] Admin dashboard failed');
      return reply.code(500).send({ success: false, error: 'Failed to fetch dashboard' });
    }
  }
}

export default new SupportController();
