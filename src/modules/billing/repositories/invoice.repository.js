import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';

class InvoiceRepository {
  async findById(id, tenantId, tx = null) {
    const client = tx || prisma;
    return client.invoice.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            medicine: { select: { name: true, genericName: true, sku: true } },
            batch: { select: { batchNumber: true, expiryDate: true } },
          },
        },
        payments: true,
        auditLogs: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        patient: { select: { fullName: true, phone: true } },
        cashier: { select: { fullName: true, email: true } },
      },
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

  async findAll(
    tenantId,
    { skip = 0, take = 20, branchId, patientId, status, fromDate, toDate } = {},
  ) {
    const where = {
      tenantId,
      deletedAt: null,
      ...(branchId && { branchId }),
      ...(patientId && { patientId }),
      ...(status && { status }),
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        const endDate = new Date(toDate);
        if (toDate.length <= 10) {
          endDate.setHours(23, 59, 59, 999);
        }
        where.createdAt.lte = endDate;
      }
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { fullName: true, phone: true } },
          cashier: { select: { fullName: true } },
          payments: { select: { paymentMode: true, amount: true } },
          items: {
            include: {
              medicine: { select: { name: true } },
              batch: { select: { batchNumber: true } },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { invoices, total };
  }

  async getNextInvoiceNumber(tenantId) {
    return sequenceService.nextInvoiceNumber(tenantId);
  }

  async update(id, tenantId, data) {
    return prisma.invoice.update({
      where: { id, tenantId },
      data,
    });
  }
}

export default new InvoiceRepository();
