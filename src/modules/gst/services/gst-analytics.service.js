import prisma from '../../../config/prisma.js';

class GstAnalyticsService {
  async getGstTrends(tenantId, months = 12) {
    const labels = [];
    const data = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      const label = `${year}-${String(month).padStart(2, '0')}`;
      labels.push(label);

      const from = new Date(year, month - 1, 1);
      const to = new Date(year, month, 0, 23, 59, 59, 999);

      const agg = await prisma.invoice.aggregate({
        where: {
          tenantId,
          createdAt: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
        _sum: {
          gstAmount: true,
          cgst: true,
          sgst: true,
          igst: true,
        },
        _count: true,
      });

      data.push({
        period: label,
        totalGst: agg._sum?.gstAmount || 0,
        cgst: agg._sum?.cgst || 0,
        sgst: agg._sum?.sgst || 0,
        igst: agg._sum?.igst || 0,
        invoiceCount: agg._count,
      });
    }

    return { labels, data };
  }

  async getGstByBranch(tenantId, options = {}) {
    const { month, year } = options;
    const from = month && year ? new Date(year, month - 1, 1) : new Date(new Date().getFullYear(), 0, 1);
    const to = month && year ? new Date(year, month, 0, 23, 59, 59, 999) : new Date();

    const invoices = await prisma.invoice.groupBy({
      by: ['branchId'],
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        deletedAt: null,
        branchId: { not: null },
      },
      _sum: {
        gstAmount: true,
        cgst: true,
        sgst: true,
        igst: true,
      },
      _count: true,
    });

    const branchIds = invoices.map((i) => i.branchId).filter(Boolean);
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });

    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    return invoices.map((i) => ({
      branchId: i.branchId,
      branchName: branchMap.get(i.branchId) || 'Unknown',
      totalGst: i._sum?.gstAmount || 0,
      cgst: i._sum?.cgst || 0,
      sgst: i._sum?.sgst || 0,
      igst: i._sum?.igst || 0,
      invoiceCount: i._count,
    }));
  }

  async getInputTaxCreditSummary(tenantId, options = {}) {
    const { from, to } = options;
    const startDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
    const endDate = to ? new Date(to) : new Date();

    const [outputGst, inputGst] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, createdAt: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' }, deletedAt: null },
        _sum: { gstAmount: true, cgst: true, sgst: true, igst: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { tenantId, invoiceDate: { gte: startDate, lte: endDate } },
        _sum: { gstAmount: true },
      }),
    ]);

    const totalOutput = outputGst._sum?.gstAmount || 0;
    const totalInput = inputGst._sum?.gstAmount || 0;

    return {
      period: { from: startDate, to: endDate },
      outputGst: totalOutput,
      inputGst: totalInput,
      netLiability: totalOutput - totalInput,
      itcUtilizationPercent: totalOutput > 0 ? Math.round((totalInput / totalOutput) * 100) : 0,
      outputBreakdown: {
        cgst: outputGst._sum?.cgst || 0,
        sgst: outputGst._sum?.sgst || 0,
        igst: outputGst._sum?.igst || 0,
      },
    };
  }
}

export default new GstAnalyticsService();
