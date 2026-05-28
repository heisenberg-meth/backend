import prisma from '../../../config/prisma.js';

class RefundAuditService {
  async logAction(tenantId, returnId, action, userId = {}) {
    return prisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || undefined,
        action,
        target: `refund:${returnId}`,
        type: 'FINANCIAL',
        date: new Date(),
      },
    });
  }

  async logInvoiceAudit(invoiceId, action, performedBy) {
    return prisma.invoiceAuditLog.create({
      data: {
        invoiceId,
        action,
        performedBy: performedBy || 'system',
        notes: `Refund action: ${action}`,
      },
    });
  }

  async getRefundAuditTrail(returnId) {
    const auditLogs = await prisma.auditLog.findMany({
      where: { target: `refund:${returnId}` },
      include: { user: { select: { fullName: true } } },
      orderBy: { date: 'desc' },
    });

    return auditLogs.map((log) => ({
      action: log.action,
      performedBy: log.user?.fullName || log.userId || 'System',
      timestamp: log.date,
    }));
  }
}

export default new RefundAuditService();
