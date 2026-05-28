import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';

class SupplierRepository {
  async findAll(tenantId, { search, status, page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { supplierCode: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { contactPerson: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: { select: { purchaseOrders: true } },
          metrics: { select: { qualityScore: true, reliabilityScore: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    return { suppliers, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id, tenantId) {
    return prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        metrics: true,
        _count: {
          select: {
            purchaseOrders: true,
            purchaseInvoices: true,
            payments: true,
            supplierReturns: true,
            ledgerEntries: true,
          },
        },
      },
    });
  }

  async findByGst(gstNumber, tenantId) {
    if (!gstNumber) return null;
    return prisma.supplier.findFirst({
      where: { gstNumber, tenantId, deletedAt: null },
    });
  }

  async getNextSupplierCode(tenantId, tx) {
    return sequenceService.nextSupplierCode(tenantId, tx);
  }

  async create(data) {
    return prisma.supplier.create({
      data: {
        ...data,
        metrics: { create: {} },
      },
      include: {
        metrics: true,
      },
    });
  }

  async update(id, tenantId, data) {
    return prisma.supplier.update({
      where: { id, tenantId },
      data,
      include: {
        metrics: true,
      },
    });
  }

  async softDelete(id, tenantId) {
    return prisma.supplier.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(tenantId) {
    const [totalSuppliers, activeSuppliers, aggregation] = await Promise.all([
      prisma.supplier.count({ where: { tenantId, deletedAt: null } }),
      prisma.supplier.count({ where: { tenantId, deletedAt: null, status: 'ACTIVE' } }),
      prisma.supplier.aggregate({
        where: { tenantId, deletedAt: null, status: 'ACTIVE' },
        _avg: { leadTimeDays: true },
        _sum: { totalPurchases: true },
      }),
    ]);

    return {
      totalSuppliers,
      activeSuppliers,
      averageLeadTimeDays: Math.round(aggregation._avg.leadTimeDays || 0),
      totalPurchases: aggregation._sum.totalPurchases || 0,
    };
  }

  async getPerformance(id, tenantId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, metrics: true },
    });
    return supplier?.metrics || null;
  }

  async getPurchaseHistory(id, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { supplierId: id, tenantId, deletedAt: null };

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getPendingPayments(id, tenantId) {
    const result = await prisma.supplierLedger.groupBy({
      by: ['supplierId'],
      where: { supplierId: id, tenantId },
      _sum: {
        debitAmount: true,
        creditAmount: true,
      },
    });

    const totalDebit = result[0]?._sum.debitAmount || 0;
    const totalCredit = result[0]?._sum.creditAmount || 0;
    const balance = totalCredit - totalDebit;

    const lastLedgerEntry = await prisma.supplierLedger.findFirst({
      where: { supplierId: id, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true, createdAt: true },
    });

    return {
      totalOutstanding: balance > 0 ? balance : 0,
      totalDebit,
      totalCredit,
      balance,
      lastUpdated: lastLedgerEntry?.createdAt || null,
      lastBalance: lastLedgerEntry?.balanceAfter || 0,
    };
  }

  async getDrugs(id, tenantId) {
    return prisma.medicineSupplier.findMany({
      where: {
        supplierId: id,
        medicine: { tenantId, deletedAt: null },
      },
      include: {
        medicine: {
          include: {
            category: { select: { name: true } },
            manufacturer: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLedger(id, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { supplierId: id, tenantId };

    const [entries, total] = await Promise.all([
      prisma.supplierLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierLedger.count({ where }),
    ]);

    return { entries, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createPayment(data) {
    return prisma.supplierPayment.create({ data });
  }

  async createLedgerEntry(data, tx) {
    const client = tx || prisma;
    return client.supplierLedger.create({ data });
  }

  async getLastLedgerBalance(supplierId, tenantId, tx) {
    const client = tx || prisma;
    const lastEntry = await client.supplierLedger.findFirst({
      where: { supplierId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return lastEntry?.balanceAfter || 0;
  }

  async getPurchaseOrders(id, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { supplierId: id, tenantId, deletedAt: null };

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          _count: { select: { items: true } },
          items: {
            include: { medicine: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return { orders, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getNextPONumber(tenantId) {
    const lastPO = await prisma.purchaseOrder.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    const year = new Date().getFullYear();
    if (!lastPO || !lastPO.orderNumber) {
      return `PO-${year}-000001`;
    }

    const parts = lastPO.orderNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = (Number.isNaN(lastNum) ? 0 : lastNum) + 1;
    return `PO-${year}-${String(nextNum).padStart(6, '0')}`;
  }

  async createPurchaseOrder(data, tx) {
    const client = tx || prisma;
    return client.purchaseOrder.create({
      data: {
        tenantId: data.tenantId,
        orderNumber: data.orderNumber,
        supplierId: data.supplierId,
        branchId: data.branchId,
        userId: data.userId,
        status: 'DRAFT',
        subtotal: data.subtotal,
        gstAmount: data.gstAmount,
        totalAmount: data.totalAmount,
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            medicineId: item.medicineId,
            medicineName: item.medicineName || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            gstPercentage: item.gstPercentage || 0,
            totalAmount: item.totalAmount,
            currentStock: item.currentStock || 0,
            reorderQty: item.reorderQty || 0,
          })),
        },
      },
      include: {
        items: {
          include: { medicine: { select: { name: true } } },
        },
        supplier: { select: { name: true } },
      },
    });
  }
}

export default new SupplierRepository();
