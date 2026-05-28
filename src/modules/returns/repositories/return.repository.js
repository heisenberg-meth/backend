import prisma from '../../../config/prisma.js';

class ReturnRepository {
  async createReturn(data, tx) {
    const client = tx || prisma;
    return client.return.create({
      data,
      include: {
        items: true,
        invoice: true,
        patient: true,
      },
    });
  }

  async findById(id, tenantId) {
    return prisma.return.findUnique({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
            invoiceItem: true,
          },
        },
        invoice: {
          include: {
            items: true,
            patient: true,
          },
        },
        creditNotes: true,
        patient: true,
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });
  }

  async findAll(tenantId, options = {}) {
    const {
      status,
      reason,
      from,
      to,
      search,
      page = 1,
      limit = 20,
    } = options;

    const where = { tenantId };

    if (status) {
      where.status = status;
    }

    if (reason) {
      where.returnReason = reason;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
        { patient: { phone: { contains: search, mode: 'insensitive' } } },
        { patient: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        include: {
          invoice: {
            select: { invoiceNumber: true, totalAmount: true },
          },
          patient: {
            select: { fullName: true, phone: true },
          },
          user: {
            select: { fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.return.count({ where }),
    ]);

    return {
      returns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id, data, tx) {
    const client = tx || prisma;
    return client.return.update({
      where: { id },
      data,
      include: {
        items: true,
        invoice: true,
      },
    });
  }

  async findByInvoiceId(invoiceId, tenantId) {
    return prisma.return.findMany({
      where: { invoiceId, tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        creditNotes: true,
      },
    });
  }

  async getReturnStats(tenantId) {
    const [total, byStatus, byReason, thisMonth] = await Promise.all([
      prisma.return.count({ where: { tenantId } }),
      prisma.return.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      prisma.return.groupBy({
        by: ['returnReason'],
        where: { tenantId },
        _count: true,
      }),
      prisma.return.aggregate({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { totalReturnAmount: true },
        _count: true,
      }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byReason: Object.fromEntries(byReason.map((r) => [r.returnReason, r._count])),
      thisMonth: {
        count: thisMonth._count,
        totalAmount: thisMonth._sum.totalReturnAmount || 0,
      },
    };
  }

  async generateReturnNumber(tenantId, branchCode) {
    const year = new Date().getFullYear();
    const prefix = `RET-${branchCode || 'GEN'}-${year}`;

    const lastReturn = await prisma.return.findFirst({
      where: {
        tenantId,
        returnNumber: { startsWith: prefix },
      },
      orderBy: { returnNumber: 'desc' },
      select: { returnNumber: true },
    });

    const sequence = lastReturn
      ? parseInt(lastReturn.returnNumber.split('-').pop(), 10) + 1
      : 1;

    return `${prefix}-${String(sequence).padStart(6, '0')}`;
  }
}

export default new ReturnRepository();
