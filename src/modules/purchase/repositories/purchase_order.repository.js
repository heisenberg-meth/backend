import prisma from '../../../config/prisma.js';

class PurchaseOrderRepository {
  async getNextPONumber(tenantId) {
    const today = new Date();
    const dateStr =
      today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');

    // Find the latest purchase order for this tenant created today
    const latestOrder = await prisma.purchaseOrder.findFirst({
      where: {
        tenantId,
        orderNumber: {
          startsWith: `PO-${dateStr}-`,
        },
      },
      orderBy: {
        orderNumber: 'desc',
      },
    });

    if (latestOrder) {
      const parts = latestOrder.orderNumber.split('-');
      const sequence = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(sequence)) {
        return `PO-${dateStr}-${String(sequence + 1).padStart(4, '0')}`;
      }
    }

    return `PO-${dateStr}-0001`;
  }

  async createPO(data) {
    const { items, ...poData } = data;
    return prisma.purchaseOrder.create({
      data: {
        ...poData,
        items: {
          create: items,
        },
      },
      include: {
        items: true,
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
}

export default new PurchaseOrderRepository();
