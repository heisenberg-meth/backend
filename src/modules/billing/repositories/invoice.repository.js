import prisma from "../../../config/prisma.js";

class InvoiceRepository {
  async findById(id, tenantId, tx = null) {
    const client = tx || prisma;
    return client.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: { select: { name: true, genericName: true, sku: true } },
            batch: { select: { batchNumber: true, expiryDate: true } }
          }
        },
        payments: true,
        auditLogs: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' }
        },
        patient: { select: { fullName: true, phone: true } },
        cashier: { select: { fullName: true, email: true } }
      }
    });
  }

  async findByInvoiceNumber(invoiceNumber, tenantId) {
    return prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        payments: true,
      },
    });
  }

  async findAll(tenantId, { skip = 0, take = 20, branchId, patientId, status } = {}) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(branchId && { branchId }),
      ...(patientId && { patientId }),
      ...(status && { status })
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { fullName: true, phone: true } },
          cashier: { select: { fullName: true } },
          payments: { select: { paymentMode: true, amount: true } },
          _count: { select: { items: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.invoice.count({ where })
    ]);

    return { invoices, total };
  }

  async getNextInvoiceNumber(tenantId) {
    const lastInvoice = await prisma.invoice.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true }
    });

    const year = new Date().getFullYear();
    if (!lastInvoice || !lastInvoice.invoiceNumber.includes(`INV-${year}`)) {
      return `INV-${year}-000001`;
    }

    const lastNum = parseInt(lastInvoice.invoiceNumber.split('-').pop());
    const nextNum = (lastNum + 1).toString().padStart(6, '0');
    return `INV-${year}-${nextNum}`;
  }

  async update(id, tenantId, data) {
    return prisma.invoice.update({
      where: { id, tenantId },
      data
    });
  }
}

export default new InvoiceRepository();
