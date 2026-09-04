import prisma from '../../../config/prisma.js';
import { generateCsvReport } from './csv-generator.js';
import { generatePdfReport } from './pdf-generator.js';

class SalesReportExportService {
  async fetchSalesReportRecords(tenantId, { fromDate, toDate, paymentMethod, status, search }) {
    const startDate = new Date(fromDate);
    startDate.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(toDate);
    endDate.setUTCHours(23, 59, 59, 999);

    const where = {
      tenantId,
      deletedAt: null,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Payment method filter
    if (paymentMethod && paymentMethod.toUpperCase() !== 'ALL') {
      where.payments = {
        some: {
          paymentMode: {
            equals: paymentMethod,
            mode: 'insensitive',
          },
        },
      };
    }

    // Status filter
    if (status && status.toUpperCase() !== 'ALL') {
      const uppercaseStatus = status.toUpperCase();
      where.OR = [{ status: uppercaseStatus }, { paymentStatus: uppercaseStatus }];
    }

    // Search filter
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      const searchConditions = [
        { invoiceNumber: { contains: searchTerm, mode: 'insensitive' } },
        { patientName: { contains: searchTerm, mode: 'insensitive' } },
        { customerName: { contains: searchTerm, mode: 'insensitive' } },
        { patientPhone: { contains: searchTerm, mode: 'insensitive' } },
        { customerPhone: { contains: searchTerm, mode: 'insensitive' } },
        { patient: { fullName: { contains: searchTerm, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { fullName: true, phone: true } },
        payments: { select: { paymentMode: true, amount: true, paymentStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map((inv) => {
      const invoiceNo = inv.invoiceNumber;
      const dateStr = inv.createdAt.toISOString().split('T')[0];
      const patientStr = inv.patientName || inv.patient?.fullName || inv.customerName || 'N/A';
      const paymentMethodStr =
        inv.payments && inv.payments.length > 0
          ? Array.from(new Set(inv.payments.map((p) => p.paymentMode))).join(', ')
          : 'N/A';
      const statusStr = inv.status || inv.paymentStatus || 'N/A';
      const subtotal = Number(inv.subtotal || 0).toFixed(2);
      const gst = Number(inv.gstAmount || 0).toFixed(2);
      const discount = Number(inv.discountAmount || 0).toFixed(2);
      const total = Number(inv.totalAmount || 0).toFixed(2);

      return {
        invoiceNo,
        date: dateStr,
        patient: patientStr,
        paymentMethod: paymentMethodStr,
        status: statusStr,
        subtotal,
        gst,
        discount,
        total,
      };
    });
  }

  async exportCsv(tenantId, params) {
    const records = await this.fetchSalesReportRecords(tenantId, params);
    return generateCsvReport(records);
  }

  async exportPdf(tenantId, params) {
    const records = await this.fetchSalesReportRecords(tenantId, params);
    return generatePdfReport(records, params);
  }
}

export default new SalesReportExportService();
