import prisma from "../../../config/prisma.js";

class SalesReturnRepository {
  async createReturn(data, tx) {
    const client = tx || prisma;
    return client.salesReturn.create({
      data: {
        tenantId: data.tenantId,
        saleId: data.saleId,
        saleItemId: data.saleItemId,
        batchId: data.batchId,
        quantity: data.quantity,
        reason: data.reason,
        refundAmount: data.refundAmount,
        status: data.status,
        createdBy: data.createdBy,
      },
      include: {
        sale: true,
        saleItem: {
          include: {
            medicine: true,
          },
        },
        batch: true,
      },
    });
  }

  async findAll(tenantId, skip = 0, take = 20) {
    return prisma.salesReturn.findMany({
      where: { tenantId },
      include: {
        sale: true,
        saleItem: {
          include: {
            medicine: true
          }
        },
        batch: true,
        user: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  }
}

export default new SalesReturnRepository();
