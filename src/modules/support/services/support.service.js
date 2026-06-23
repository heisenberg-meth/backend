import prisma from '../../../config/prisma.js';

class SupportService {
  async createTicket(tenantId, userId, data) {
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId,
        subject: data.subject,
        message: data.message,
        priority: data.priority || 'MEDIUM',
        status: 'OPEN',
        createdBy: userId,
      },
    });

    // Save the initial message as the first reply
    await prisma.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        message: data.message,
        authorId: userId,
        authorRole: 'STAFF',
      },
    });

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

    // Only allow the creator or admins/owners to view
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
    const authorRole = user?.role === 'OWNER' || user?.role === 'ADMIN' ? 'ADMIN' : 'STAFF';

    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId,
        authorId: userId,
        authorRole,
        message,
      },
    });

    // Auto-transition statuses based on who replied
    if (ticket.status === 'WAITING_FOR_STAFF' && authorRole === 'STAFF') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    } else if (ticket.status === 'OPEN' && authorRole === 'ADMIN') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    } else if (ticket.status === 'IN_PROGRESS' && authorRole === 'ADMIN') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'WAITING_FOR_STAFF' },
      });
    }

    return reply;
  }

  async resolveTicket(tenantId, ticketId) {
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
      prisma.supportTicket.count({
        where: { tenantId, createdBy: userId, status: 'IN_PROGRESS' },
      }),
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

    // Average resolution time
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
