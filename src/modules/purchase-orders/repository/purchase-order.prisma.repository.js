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
}

export default new PurchaseOrderPrismaRepository();
