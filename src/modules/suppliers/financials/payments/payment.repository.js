import prisma from "../../../../config/prisma.js";

class PaymentRepository {
  async createPayment(data, tx) {
    const client = tx || prisma;
    return client.supplierPayment.create({
      data,
      include: { supplier: true },
    });
  }

  async findAll(tenantId, { skip = 0, take = 20, supplierId } = {}) {
    return prisma.supplierPayment.findMany({
      where: { 
        tenantId,
        ...(supplierId && { supplierId })
      },
      include: { 
        supplier: {
          select: {
            id: true,
            name: true,
            supplierCode: true
          }
        },
        user: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { paymentDate: 'desc' },
      skip,
      take
    });
  }

  async findById(tenantId, id) {
    return prisma.supplierPayment.findFirst({
      where: { id, tenantId },
      include: { 
        supplier: true,
        allocations: {
          include: {
            purchaseInvoice: true
          }
        }
      }
    });
  }

  async count(tenantId, { supplierId } = {}) {
    return prisma.supplierPayment.count({
      where: { 
        tenantId,
        ...(supplierId && { supplierId })
      }
    });
  }
}

export default new PaymentRepository();
