import prisma from '../../../config/prisma.js';

class SalesRepository {
  async createSale(data, tx) {
    const client = tx || prisma;
    console.log(
      '[SALE CREATE PAYLOAD]',
      JSON.stringify(
        data.items.map((i) => ({
          medicineId: i.medicineId,
          batchId: i.batchId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          gstAmount: i.gstAmount,
          cgst: i.cgst,
          sgst: i.sgst,
          igst: i.igst,
          totalAmount: i.totalAmount,
        })),
        null,
        2,
      ),
    );
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
        returns: true,
      },
    });
  }

  async findAll(tenantId, skip = 0, take = 20) {
    return prisma.sale.findMany({
      where: { tenantId },
      include: {
        items: true,
        patient: true,
      },
      orderBy: { soldAt: 'desc' },
      skip,
      take,
    });
  }

  async countAll(tenantId) {
    return prisma.sale.count({
      where: { tenantId },
    });
  }
}

export default new SalesRepository();
