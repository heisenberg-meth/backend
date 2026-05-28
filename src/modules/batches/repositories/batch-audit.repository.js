import prisma from '../../../config/prisma.js';

class BatchAuditRepository {
  async log(data) {
    return prisma.batchAuditLog.create({
      data: {
        tenantId: data.tenantId,
        batchId: data.batchId,
        actionType: data.actionType,
        beforeState: data.beforeState || {},
        afterState: data.afterState || {},
        performedBy: data.performedBy,
        reason: data.reason,
        notes: data.notes,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async findByBatchId(batchId) {
    return prisma.batchAuditLog.findMany({
      where: { batchId },
      include: {
        user: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { performedAt: 'desc' },
    });
  }
}

export default new BatchAuditRepository();
