import prisma from "../../../config/prisma.js";
import sequenceService from '../../../shared/services/sequence.service.js';

class PurchaseOrderRepository {
  async createPO(data, tx) {
    const client = tx || prisma;
    return client.purchaseOrder.create({
      data: {
        tenantId: data.tenantId,
        orderNumber: data.orderNumber,
        supplierId: data.supplierId,
        status: data.status,
        subtotal: data.subtotal,
        gstAmount: data.gstAmount,
        totalAmount: data.totalAmount,
        expectedDeliveryDate: data.expectedDeliveryDate,
        notes: data.notes,
        userId: data.userId,
        items: {
          create: data.items.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            gstPercentage: item.gstPercentage,
            cgst: item.cgst || 0,
            sgst: item.sgst || 0,
            igst: item.igst || 0,
            totalAmount: item.totalAmount,
          })),
        },
      },
      include: {
        items: {
          include: {
            medicine: true,
          },
        },
        supplier: true,
      },
    });
  }

  async findById(id, tenantId) {
    return prisma.purchaseOrder.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: true
          }
        },
        supplier: true
      }
    });
  }

  async findAll(tenantId, skip = 0, take = 20) {
    return prisma.purchaseOrder.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        supplier: true,
        items: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  }

  async updateStatus(id, tenantId, status, tx) {
    const client = tx || prisma;
    return client.purchaseOrder.update({
      where: { id, tenantId },
      data: { status }
    });
  }

  async getNextPONumber(tenantId, tx) {
    return sequenceService.nextPONumber(tenantId, tx);
  }
}

export default new PurchaseOrderRepository();
