import prisma from '../../../config/prisma.js';

class RefundRepository {
  async createRefund(data, tx) {
    const client = tx || prisma;
    return client.return.create({ data });
  }

  async createRefundItems(items, tx) {
    const client = tx || prisma;
    return client.returnItem.createMany({ data: items });
  }

  async createRefundPayment(data, tx) {
    const client = tx || prisma;
    return client.refundPayment.create({ data });
  }

  async findRefundById(id, include = {}) {
    return prisma.return.findUnique({
      where: { id },
      include: {
        items: {
          include: { medicine: true, batch: true },
        },
        refundPayments: true,
        invoice: true,
        patient: true,
        creditNotes: true,
        ...include,
      },
    });
  }

  async findRefunds(tenantId, options = {}) {
    const { status, patientId, from, to, limit, offset, include } = options;
    const where = { tenantId };

    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: include || {
          invoice: { select: { invoiceNumber: true } },
          patient: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit || 50,
        skip: offset || 0,
      }),
      prisma.return.count({ where }),
    ]);

    return { data, total };
  }

  async updateRefundStatus(id, data, tx) {
    const client = tx || prisma;
    return client.return.update({ where: { id }, data });
  }

  async updateRefundItem(id, data, tx) {
    const client = tx || prisma;
    return client.returnItem.update({ where: { id }, data });
  }

  async findInvoiceWithItems(invoiceId, tenantId) {
    return prisma.invoice.findUnique({
      where: { id: invoiceId, tenantId },
      include: {
        items: { include: { medicine: true, batch: true } },
        payments: true,
      },
    });
  }

  async findExistingRefunds(invoiceId, invoiceItemId) {
    return prisma.return.findMany({
      where: {
        invoiceId,
        status: { notIn: ['REJECTED', 'CANCELLED'] },
        items: invoiceItemId ? { some: { invoiceItemId } } : undefined,
      },
      include: { items: true },
    });
  }

  async getFraudMetrics(tenantId, patientId, sinceDate) {
    const [recentRefunds, patientTotal] = await Promise.all([
      prisma.return.findMany({
        where: {
          tenantId,
          patientId,
          createdAt: { gte: sinceDate },
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        },
        select: { totalReturnAmount: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.return.aggregate({
        where: { tenantId, patientId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
        _sum: { totalReturnAmount: true },
        _count: true,
      }),
    ]);

    return {
      recentRefunds,
      totalRefunds: patientTotal._count,
      totalRefundAmount: patientTotal._sum?.totalReturnAmount || 0,
    };
  }

  async getAnalytics(tenantId, options = {}) {
    const { from, to } = options;
    const where = { tenantId, status: { notIn: ['REJECTED', 'CANCELLED'] } };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [aggregated, byReason, monthlyData] = await Promise.all([
      prisma.return.aggregate({
        where,
        _sum: { totalReturnAmount: true },
        _count: true,
      }),
      prisma.return.groupBy({
        by: ['returnReason'],
        where,
        _sum: { totalReturnAmount: true },
        _count: true,
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.return.groupBy({
        by: ['returnReason'],
        where: {
          ...where,
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) },
        },
        _sum: { totalReturnAmount: true },
        _count: true,
      }),
    ]);

    const totalSalesAgg = await prisma.invoice.aggregate({
      where: {
        tenantId,
        deletedAt: null,
        createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
      },
      _sum: { totalAmount: true },
    });

    return {
      totalRefunds: aggregated._count,
      totalRefundAmount: aggregated._sum?.totalReturnAmount || 0,
      totalSales: totalSalesAgg._sum?.totalAmount || 0,
      byReason,
      monthlyData,
    };
  }

  async countPendingApprovals(tenantId) {
    return prisma.return.count({
      where: { tenantId, status: 'UNDER_REVIEW', approvalRequired: true },
    });
  }
}

export default new RefundRepository();
