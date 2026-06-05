import prisma from '../../../config/prisma.js';

class SmsRepository {
  async createNotification(data) {
    return prisma.smsNotification.create({
      data,
    });
  }

  async updateStatus(id, status, error = null) {
    return prisma.smsNotification.update({
      where: { id },
      data: {
        status,
        error,
        sentAt: status === 'SENT' ? new Date() : undefined,
      },
    });
  }

  async findHistory(tenantId, skip = 0, take = 20) {
    return prisma.smsNotification.findMany({
      where: { tenantId },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }
}

export default new SmsRepository();
