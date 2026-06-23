import prisma from '../../../config/prisma.js';

class SupportService {
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
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority || 'MEDIUM',
        status: 'OPEN',
        createdById: userId,
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

    return ticket;
  }

  async getMyTickets(tenantId, userId, query = {}) {
    const { status, priority, page = 1, limit = 20 } = query;
    const where = {
      tenantId,
      createdById: userId,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } },
          _count: { select: { messages: true } },
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
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        assignedTo: { select: { id: true, fullName: true, email: true } },
        messages: {
          include: {
            sender: { select: { id: true, fullName: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
      },
    });

    if (!ticket) return null;

    if (ticket.createdById !== userId) {
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

    const reply = await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderRole,
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

    return reply;
  }

  async uploadAttachment(tenantId, ticketId, userId, fileData) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const attachment = await prisma.supportAttachment.create({
      data: {
        ticketId,
        fileName: fileData.fileName,
        fileUrl: fileData.fileUrl,
        fileSize: fileData.fileSize,
        uploadedBy: userId,
      },
    });

    return attachment;
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
        resolutionSummary: resolution,
        resolvedAt: new Date(),
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'RESOLVED',
        oldValue: ticket.status,
        newValue: 'RESOLVED',
        performedBy: userId,
      },
    });

    return updated;
  }

  async closeTicket(tenantId, ticketId, userId) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, tenantId },
    });

    if (!ticket) throw new Error('Ticket not found');

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'CLOSED',
        oldValue: ticket.status,
        newValue: 'CLOSED',
        performedBy: userId,
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
        resolutionSummary: null,
      },
    });

    await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        senderRole: 'STAFF',
        message: `Ticket reopened. Reason: ${reason}`,
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'REOPENED',
        oldValue: ticket.status,
        newValue: 'OPEN',
        performedBy: userId,
      },
    });

    return updated;
  }

  async getStaffDashboard(tenantId, userId) {
    const [open, inProgress, resolved, closed] = await Promise.all([
      prisma.supportTicket.count({ where: { tenantId, createdById: userId, status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { tenantId, createdById: userId, status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { tenantId, createdById: userId, status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { tenantId, createdById: userId, status: 'CLOSED' } }),
    ]);

    return { open, inProgress, resolved, closed };
  }

  async getAdminDashboard(tenantId) {
    const [total, open, inProgress, waitingForStaff, resolved, closed, critical] = await Promise.all([
      prisma.supportTicket.count({ where: { tenantId } }),
      prisma.supportTicket.count({ where: { tenantId, status: 'OPEN' } }),
      prisma.supportTicket.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      prisma.supportTicket.count({ where: { tenantId, status: 'WAITING_FOR_STAFF' } }),
      prisma.supportTicket.count({ where: { tenantId, status: 'RESOLVED' } }),
      prisma.supportTicket.count({ where: { tenantId, status: 'CLOSED' } }),
      prisma.supportTicket.count({ where: { tenantId, priority: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ]);

    // Average resolution time
    const resolvedTickets = await prisma.supportTicket.findMany({
      where: { tenantId, status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true },
    });

    let avgResolutionHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        return sum + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
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
