import prisma from '../../../config/prisma.js';

class SalesRepository {
  async createSale(data, tx) {
    const client = tx || prisma;
    return client.sale.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId,
        invoiceId: data.invoiceId,
        patientId: data.patientId,
        totalItems: data.totalItems,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        gstAmount: data.gstAmount,
        totalAmount: data.totalAmount,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        status: data.status,
        soldBy: data.soldBy,
        items: {
          create: data.items.map((item) => ({
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            gstAmount: item.gstAmount,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        invoice: true,
        patient: true,
      },
    });
  }

  async findById(id, tenantId) {
    return prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        invoice: true,
        patient: true,
        salesReturns: {
          include: {
            items: true,
          },
        },
      },
    });
  }

  _safeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  _dateFilter(dateFilter) {
    if (!dateFilter) return {};
    const where = {};
    if (dateFilter.from || dateFilter.to) {
      where.soldAt = {};
      const fromDate = this._safeDate(dateFilter.from);
      const toDate = this._safeDate(dateFilter.to);
      if (fromDate) where.soldAt.gte = fromDate;
      if (toDate) {
        toDate.setHours(23, 59, 59, 999);
        where.soldAt.lte = toDate;
      }
      if (Object.keys(where.soldAt).length === 0) {
        delete where.soldAt;
      }
    }
    return where;
  }

  async findAll(tenantId, skip = 0, take = 20, dateFilter = null) {
    return prisma.sale.findMany({
      where: { tenantId, ...this._dateFilter(dateFilter) },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        patient: true,
        invoice: true,
      },
      orderBy: { soldAt: 'desc' },
      skip,
      take,
    });
  }

  async countAll(tenantId, dateFilter = null) {
    return prisma.sale.count({
      where: { tenantId, ...this._dateFilter(dateFilter) },
    });
  }
}

export default new SalesRepository();
