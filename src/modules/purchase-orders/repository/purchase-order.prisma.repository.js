import { logger } from '@sentry/node';
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
    const validBranchId =
      typeof branchId === 'string' && branchId.trim() !== '' ? branchId.trim() : null;

    const orderWhere = {
      tenantId,
      deletedAt: null,
      ...(validBranchId ? { branchId: validBranchId } : {}),
    };

    const invoiceWhere = {
      tenantId,
    };

    // Valid PurchaseOrderStatus enum members awaiting receipt/fulfillment
    const pendingOrderStatuses = [
      'PENDING',
      'APPROVED',
      'PARTIALLY_RECEIVED',
      'SENT',
      'SENT_TO_SUPPLIER',
      'ACKNOWLEDGED',
      'PENDING_APPROVAL',
      'DRAFT',
    ];
    const receivedOrderStatuses = ['RECEIVED', 'CLOSED', 'RECONCILED'];
    const cancelledOrderStatuses = ['CANCELLED', 'REJECTED'];

    const [
      totalOrders,
      pendingOrders,
      approvedOrders,
      receivedOrders,
      cancelledOrders,
      ordersAggregate,
      totalInvoices,
      pendingPaymentInvoices,
      paidInvoices,
      partialInvoices,
      cancelledInvoices,
      invoicesAggregate,
    ] = await Promise.all([
      prisma.purchaseOrder.count({ where: orderWhere }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: pendingOrderStatuses } },
      }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: 'APPROVED' },
      }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: receivedOrderStatuses } },
      }),
      prisma.purchaseOrder.count({
        where: { ...orderWhere, status: { in: cancelledOrderStatuses } },
      }),
      prisma.purchaseOrder.aggregate({
        where: { ...orderWhere, status: { in: pendingOrderStatuses } },
        _sum: {
          totalAmount: true,
          balanceAmount: true,
        },
      }),
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
    ]);

    const pendingOrdersTotal =
      ordersAggregate?._sum?.totalAmount != null ? Number(ordersAggregate._sum.totalAmount) : 0;

    const pendingInvoiceBalance =
      invoicesAggregate?._sum?.balanceAmount != null
        ? Number(invoicesAggregate._sum.balanceAmount)
        : invoicesAggregate?._sum?.totalAmount != null
          ? Number(invoicesAggregate._sum.totalAmount)
          : 0;

    let activeSuppliers = 0;
    let supplierReturns = 0;
    try {
      if (typeof prisma.supplier?.count === 'function') {
        activeSuppliers = await prisma.supplier.count({
          where: { tenantId, deletedAt: null, status: 'ACTIVE' },
        });
      }
      if (typeof prisma.supplierReturn?.aggregate === 'function') {
        const retAgg = await prisma.supplierReturn.aggregate({
          where: { tenantId },
          _sum: { returnAmount: true },
        });
        supplierReturns = retAgg?._sum?.returnAmount != null ? Number(retAgg._sum.returnAmount) : 0;
      }
    } catch (error) {
      logger.error(error, 'Error fetching supplier data');
    }

    const thisMonthPurchases =
      invoicesAggregate?._sum?.totalAmount != null ? Number(invoicesAggregate._sum.totalAmount) : 0;

    return {
      thisMonthPurchases,
      pendingPurchaseOrders: pendingOrders,
      supplierReturns,
      activeSuppliers,
      total: totalOrders,
      pending: pendingOrders,
      approved: approvedOrders,
      received: receivedOrders,
      cancelled: cancelledOrders,
      totalPurchaseOrders: totalOrders,
      approvedPurchaseOrders: approvedOrders,
      receivedPurchaseOrders: receivedOrders,
      cancelledPurchaseOrders: cancelledOrders,
      pendingValue: pendingOrdersTotal,
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        approved: approvedOrders,
        received: receivedOrders,
        cancelled: cancelledOrders,
        pendingValue: pendingOrdersTotal,
      },
      invoices: {
        total: totalInvoices,
        pendingPayment: pendingPaymentInvoices,
        paid: paidInvoices,
        partial: partialInvoices,
        cancelled: cancelledInvoices,
        pendingValue: pendingInvoiceBalance,
      },
    };
  }
}

export default new PurchaseOrderPrismaRepository();
