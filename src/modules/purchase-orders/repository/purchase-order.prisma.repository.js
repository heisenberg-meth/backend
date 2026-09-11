import prisma from '../../../config/prisma.js';

class PurchaseOrderPrismaRepository {
  async findAll(tenantId, filters = {}) {
    const { branchId, supplierId, status, from, to } = filters;

    return prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
            inventoryBatches: {
              where: { deletedAt: null },
              select: {
                id: true,
                batchNumber: true,
                expiryDate: true,
                quantity: true,
                availableQuantity: true,
              },
            },
          },
        },
        goodsReceiptNotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            fullName: true,
          },
        },
      },
    });
  }

  async create(orderData, tenantId, userId) {
    const { items, ...details } = orderData;

    return prisma.purchaseOrder.create({
      data: {
        ...details,
        tenantId,
        userId,
        items: {
          create: items,
        },
      },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async updateStatus(id, tenantId, status, tx) {
    const client = tx || prisma;
    return client.purchaseOrder.update({
      where: { id, tenantId },
      data: { status },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async delete(id, tenantId) {
    return prisma.purchaseOrder.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getSummary(tenantId, branchId = null) {
    const invoiceWhere = {
      tenantId,
    };

    const orderWhere = {
      tenantId,
      deletedAt: null,
      ...(branchId ? { branchId } : {}),
    };

    const pendingOrderStatuses = [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ORDERED',
      'SENT',
      'SENT_TO_SUPPLIER',
      'ACKNOWLEDGED',
      'PARTIALLY_RECEIVED',
    ];

    const [
      totalInvoices,
      pendingInvoices,
      paidInvoices,
      partialInvoices,
      cancelledInvoices,
      invoicesAggregate,
      totalOrders,
      pendingOrders,
      receivedOrders,
      cancelledOrders,
      ordersAggregate,
    ] = await Promise.all([
      prisma.purchaseInvoice.count({ where: invoiceWhere }),
      prisma.purchaseInvoice.count({
        where: { ...invoiceWhere, paymentStatus: 'PENDING' },
      }),
      prisma.purchaseInvoice.count({
        where: { ...invoiceWhere, paymentStatus: 'PAID' },
      }),
      prisma.purchaseInvoice.count({
        where: { ...invoiceWhere, paymentStatus: { in: ['PARTIAL', 'PARTIALLY_PAID'] } },
      }),
      prisma.purchaseInvoice.count({
        where: { ...invoiceWhere, paymentStatus: 'CANCELLED' },
      }),
      prisma.purchaseInvoice.aggregate({
        where: {
          ...invoiceWhere,
          paymentStatus: { in: ['PENDING', 'PARTIAL', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        _sum: {
          balanceAmount: true,
          totalAmount: true,
        },
      }),
      prisma.purchaseOrder.count({ where: orderWhere }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: pendingOrderStatuses } },
      }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: ['RECEIVED', 'CLOSED', 'RECONCILED'] } },
      }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: ['CANCELLED', 'REJECTED'] } },
      }),
      prisma.purchaseOrder.aggregate({
        where: { ...orderWhere, status: { in: pendingOrderStatuses } },
        _sum: {
          totalAmount: true,
          balanceAmount: true,
        },
      }),
    ]);

    const pendingInvoiceBalance =
      invoicesAggregate?._sum?.balanceAmount != null
        ? Number(invoicesAggregate._sum.balanceAmount)
        : invoicesAggregate?._sum?.totalAmount != null
          ? Number(invoicesAggregate._sum.totalAmount)
          : 0;

    const pendingOrdersTotal =
      ordersAggregate?._sum?.totalAmount != null ? Number(ordersAggregate._sum.totalAmount) : 0;

    return {
      totalPurchaseOrders: totalInvoices,
      pendingPurchaseOrders: pendingInvoices,
      paidPurchaseOrders: paidInvoices,
      cancelledPurchaseOrders: cancelledInvoices,
      pendingValue: pendingInvoiceBalance,
      invoices: {
        total: totalInvoices,
        pending: pendingInvoices,
        paid: paidInvoices,
        partial: partialInvoices,
        cancelled: cancelledInvoices,
        pendingValue: pendingInvoiceBalance,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        completed: receivedOrders,
        cancelled: cancelledOrders,
        pendingValue: pendingOrdersTotal,
      },
    };
  }
}

export default new PurchaseOrderPrismaRepository();
