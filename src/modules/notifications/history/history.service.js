import prisma from '../../../config/prisma.js';

class NotificationHistoryService {
  /**
   * Get paginated notification history with filters
   */
  async getHistory(tenantId, filters = {}) {
    const { channel, status, patientId, userId, from, to, page = 1, limit = 20 } = filters;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {
      tenantId,
      ...(channel && { channel }),
      ...(status && { deliveryStatus: status }),
      ...(patientId && { patientId }),
      ...(userId && { userId }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          deliveryEvents: {
            orderBy: { eventTimestamp: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Get specific notification details including all delivery events
   */
  async getDetails(id, tenantId) {
    return await prisma.notification.findFirst({
      where: { id, tenantId },
      include: {
        deliveryEvents: {
          orderBy: { eventTimestamp: 'asc' },
        },
        deadLetter: true,
      },
    });
  }
}

export default new NotificationHistoryService();
