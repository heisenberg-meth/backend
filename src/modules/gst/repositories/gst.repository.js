import prisma from '../../../config/prisma.js';

class GstRepository {
  async upsertGstSummary(tenantId, reportMonth, data) {
    const month = new Date(reportMonth);
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    return prisma.gstSummary.upsert({
      where: {
        tenantId_reportMonth: { tenantId, reportMonth: month },
      },
      update: { ...data, generatedAt: new Date() },
      create: { tenantId, reportMonth: month, ...data },
    });
  }

  async findGstSummaries(tenantId, options = {}) {
    const { from, to, limit } = options;
    const where = { tenantId };

    if (from || to) {
      where.reportMonth = {};
      if (from) where.reportMonth.gte = new Date(from);
      if (to) where.reportMonth.lte = new Date(to);
    }

    return prisma.gstSummary.findMany({
      where,
      orderBy: { reportMonth: 'desc' },
      take: limit || 100,
    });
  }

  async getAggregatedGst(tenantId, from, to) {
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      select: {
        cgst: true,
        sgst: true,
        igst: true,
        totalAmount: true,
        subtotal: true,
      },
    });

    const result = {
      taxableAmount: 0,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      gstCollected: 0,
      totalAmount: 0,
      totalInvoices: invoices.length,
    };

    for (const inv of invoices) {
      result.taxableAmount += Number(inv.subtotal);
      result.cgstTotal += Number(inv.cgst || 0);
      result.sgstTotal += Number(inv.sgst || 0);
      result.igstTotal += Number(inv.igst || 0);
      result.totalAmount += Number(inv.totalAmount);
    }

    result.gstCollected = result.cgstTotal + result.sgstTotal + result.igstTotal;

    return {
      ...result,
      taxableAmount: parseFloat(result.taxableAmount.toFixed(2)),
      cgstTotal: parseFloat(result.cgstTotal.toFixed(2)),
      sgstTotal: parseFloat(result.sgstTotal.toFixed(2)),
      igstTotal: parseFloat(result.igstTotal.toFixed(2)),
      gstCollected: parseFloat(result.gstCollected.toFixed(2)),
    };
  }

  async findHsnSummaries(tenantId, options = {}) {
    const { from, to } = options;
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = to ? new Date(to) : new Date();

    const invoiceItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
      },
      include: {
        medicine: { select: { hsnCode: true, name: true } },
      },
    });

    const hsnMap = {};

    for (const item of invoiceItems) {
      const hsn = item.medicine?.hsnCode || 'NA';
      if (!hsnMap[hsn]) {
        hsnMap[hsn] = {
          hsnCode: hsn,
          taxableValue: 0,
          totalGst: 0,
          totalQuantity: 0,
          medicineName: item.medicine?.name,
        };
      }
      hsnMap[hsn].taxableValue += Number(item.unitPrice) * item.quantity;
      hsnMap[hsn].totalGst +=
        Number(item.cgst || 0) + Number(item.sgst || 0) + Number(item.igst || 0);
      hsnMap[hsn].totalQuantity += item.quantity;
    }

    return Object.values(hsnMap).map((h) => ({
      ...h,
      taxableValue: parseFloat(h.taxableValue.toFixed(2)),
      totalGst: parseFloat(h.totalGst.toFixed(2)),
    }));
  }

  async findGstAuditLogs(tenantId, options = {}) {
    const { from, to, limit = 50 } = options;
    const where = {
      invoice: { tenantId },
    };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    return prisma.invoiceAuditLog.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getInputTaxCredit(tenantId, from, to) {
    const startDate = new Date(from);
    const endDate = new Date(to);

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startDate, lte: endDate },
      },
      select: { gstAmount: true, totalAmount: true },
    });

    let totalInputGst = 0;
    let totalPurchaseAmount = 0;

    for (const inv of purchaseInvoices) {
      totalInputGst += Number(inv.gstAmount || 0);
      totalPurchaseAmount += Number(inv.totalAmount || 0);
    }

    return {
      totalInputGst: parseFloat(totalInputGst.toFixed(2)),
      totalPurchaseAmount: parseFloat(totalPurchaseAmount.toFixed(2)),
      invoiceCount: purchaseInvoices.length,
    };
  }
}

export default new GstRepository();
