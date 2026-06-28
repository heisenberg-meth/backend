import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupportService {
  async _notify(tenantId, userId, message, metadata = {}) {
    try {
      await prisma.notification.create({
        data: {
          tenantId,
          userId,
          message,
          notificationType: 'SUPPORT_TICKET',
          subject: metadata.subject || 'Support Ticket Update',
          metadata,
        },
      });
    } catch (err) {
      logger.warn({ err: err.message, tenantId, userId }, 'Failed to create support notification');
    }
  }

  async _notifyAdmins(tenantId, message, excludeUserId, metadata = {}) {
    try {
      const admins = await prisma.user.findMany({
        where: {
          tenantId,
          role: { in: ['OWNER', 'ADMIN'] },
          id: { not: excludeUserId },
          deletedAt: null,
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await this._notify(tenantId, admin.id, message, metadata);
      }
    } catch (err) {
      logger.warn({ err: err.message, tenantId }, 'Failed to notify admins');
    }
  }
  async generateTicketNumber(tenantId) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `TKT-${dateStr}`;

    const count = await prisma.supportTicket.count({
      where: {
        tenantId,
        ticketNumber: { startsWith: prefix },
      },
    });

    return `${prefix}-${String(count + 1).padStart(4, '0')}`;
  }

  async createTicket(tenantId, userId, data) {
    const ticketNumber = await this.generateTicketNumber(tenantId);

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        tenantId,
        subject: data.title || data.subject,
        message: data.description || data.message,
        priority: data.priority || 'MEDIUM',
        status: 'OPEN',
        createdBy: userId,
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId: ticket.id,
        action: 'CREATED',
        newValue: 'OPEN',
        performedBy: userId,
      },
    });

    // Notify all admins about new ticket
    await this._notifyAdmins(
      tenantId,
      `New support ticket ${ticketNumber}: ${data.title || data.subject}`,
      userId,
      { ticketId: ticket.id, ticketNumber, priority: data.priority || 'MEDIUM' },
    );

    return ticket;
  }

  async getMyTickets(tenantId, userId, query = {}) {
    const { status, priority, page = 1, limit = 20 } = query;
    const where = {
      tenantId,
      createdBy: userId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          assignee: { select: { id: true, fullName: true, email: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTicketDetails(tenantId, ticketId, userId) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        creator: { select: { id: true, fullName: true, email: true, role: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
        replies: {
          include: {
            author: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) return null;

    if (ticket.createdBy !== userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.role !== 'OWNER' && user?.role !== 'ADMIN') {
        return null;
      }
    }

    return ticket;
  }

  async addReply(tenantId, ticketId, userId, message) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const senderRole = user?.role === 'OWNER' || user?.role === 'ADMIN' ? 'ADMIN' : 'STAFF';

    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId,
        authorId: userId,
        authorRole: senderRole,
        message,
      },
    });

    if (ticket.status === 'WAITING_FOR_STAFF' && senderRole === 'STAFF') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    } else if (ticket.status === 'IN_PROGRESS' && senderRole === 'ADMIN') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'WAITING_FOR_STAFF' },
      });
    }

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'REPLY_ADDED',
        newValue: senderRole,
        performedBy: userId,
      },
    });

    // Notify the other party
    if (senderRole === 'ADMIN') {
      // Admin replied → notify ticket creator
      await this._notify(
        tenantId,
        ticket.createdBy,
        `Admin replied to your ticket ${ticket.ticketNumber}`,
        { ticketId, ticketNumber: ticket.ticketNumber, action: 'REPLY' },
      );
    } else {
      // Staff replied → notify admins
      await this._notifyAdmins(tenantId, `New reply on ticket ${ticket.ticketNumber}`, userId, {
        ticketId,
        ticketNumber: ticket.ticketNumber,
        action: 'REPLY',
      });
    }

    return reply;
  }

  async resolveTicket(tenantId, ticketId, userId, resolution) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    // Notify ticket creator
    await this._notify(tenantId, ticket.createdBy, `Your ticket has been resolved`, {
      ticketId,
      action: 'RESOLVED',
      resolution,
    });

    return updated;
  }

  async closeTicket(tenantId, ticketId) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'CLOSED',
      },
    });

    // Notify ticket creator
    await this._notify(tenantId, ticket.createdBy, `Your ticket has been closed`, {
      ticketId,
      action: 'CLOSED',
    });

    return updated;
  }

  async reopenTicket(tenantId, ticketId, userId, reason) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        resolvedAt: null,
      },
    });

    await prisma.supportTicketReply.create({
      data: {
        ticketId,
        authorId: userId,
        authorRole: 'STAFF',
        message: `Ticket reopened. Reason: ${reason}`,
      },
    });

    return updated;
  }

  async getStaffDashboard(tenantId, userId) {
    const [open, inProgress, resolved, closed] = await Promise.all([
      prisma.supportTicket.count({ where: { tenantId, createdBy: userId, status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { tenantId, createdBy: userId, status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { tenantId, createdBy: userId, status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { tenantId, createdBy: userId, status: 'CLOSED' } }),
    ]);

    return { open, inProgress, resolved, closed };
  }

  async getAdminDashboard(tenantId) {
    const [total, open, inProgress, waitingForStaff, resolved, closed, critical] =
      await Promise.all([
        prisma.supportTicket.count({ where: { tenantId } }),
        prisma.supportTicket.count({ where: { tenantId, status: 'OPEN' } }),
        prisma.supportTicket.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
        prisma.supportTicket.count({ where: { tenantId, status: 'WAITING_FOR_STAFF' } }),
        prisma.supportTicket.count({ where: { tenantId, status: 'RESOLVED' } }),
        prisma.supportTicket.count({ where: { tenantId, status: 'CLOSED' } }),
        prisma.supportTicket.count({
          where: { tenantId, priority: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } },
        }),
      ]);

    const resolvedTickets = await prisma.supportTicket.findMany({
      where: { tenantId, status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });

    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        return (
          sum +
          (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60)
        );
      }, 0);
      avgResolutionHours = Math.round(totalHours / resolvedTickets.length);
    }

    return {
      totalTickets: total,
      open,
      inProgress,
      waitingForStaff,
      resolved,
      closed,
      critical,
      avgResolutionHours,
    };
  }
}

export default new SupportService();
