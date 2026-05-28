import prisma from '../../../config/prisma.js';
import gstRepository from '../repositories/gst.repository.js';
import logger from '../../../shared/utils/logger.js';

class GstAggregationService {
  async getGstSummary(tenantId, options = {}) {
    const { from, to, period } = options;

    if (from && to) {
      const invoices = await gstRepository.getAggregatedGst(tenantId, from, to);
      return {
        ...invoices,
        period: { from, to },
        generatedAt: new Date().toISOString(),
      };
    }

    if (period === 'MONTHLY' || period === 'YEARLY') {
      const summaries = await gstRepository.findGstSummaries(tenantId, { from, to });
      const aggregated = summaries.reduce(
        (acc, s) => {
          acc.taxableAmount += s.outputTax;
          acc.gstCollected += s.outputTax;
          acc.totalInvoices += 1;
          return acc;
        },
        {
          taxableAmount: 0,
          cgstTotal: 0,
          sgstTotal: 0,
          igstTotal: 0,
          gstCollected: 0,
          totalInvoices: 0,
        },
      );
      return {
        ...aggregated,
        summaries: summaries.map((s) => ({
          month: s.reportMonth,
          outputTax: s.outputTax,
          inputTaxCredit: s.inputTaxCredit,
          netGstPayable: s.netGstPayable,
        })),
        period: period,
        generatedAt: new Date().toISOString(),
      };
    }

    const summaries = await gstRepository.findGstSummaries(tenantId, { limit: 12 });
    const latest = summaries[0] || { outputTax: 0, inputTaxCredit: 0, netGstPayable: 0 };

    return {
      taxableAmount: latest.outputTax,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      gstCollected: latest.outputTax,
      totalInvoices: 0,
      summaries: summaries.map((s) => ({
        month: s.reportMonth,
        outputTax: s.outputTax,
        inputTaxCredit: s.inputTaxCredit,
        netGstPayable: s.netGstPayable,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  async generateMonthlySummary(tenantId, monthDate) {
    const startOfMonth = new Date(monthDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const invoices = await gstRepository.getAggregatedGst(
      tenantId,
      startOfMonth.toISOString(),
      endOfMonth.toISOString(),
    );

    const purchaseData = await gstRepository.getInputTaxCredit(
      tenantId,
      startOfMonth.toISOString(),
      endOfMonth.toISOString(),
    );

    const summary = await gstRepository.upsertGstSummary(tenantId, startOfMonth, {
      totalSalesGst: invoices.gstCollected,
      totalPurchaseGst: purchaseData.totalInputGst,
      outputTax: invoices.gstCollected,
      inputTaxCredit: purchaseData.totalInputGst,
      netGstPayable: parseFloat((invoices.gstCollected - purchaseData.totalInputGst).toFixed(2)),
    });

    logger.info(`[GST] Monthly summary generated for ${startOfMonth.toISOString().slice(0, 7)}`);
    return summary;
  }

  async getBranchGstSummary(tenantId, branchId, from, to) {
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        branchId,
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      select: {
        cgst: true,
        sgst: true,
        igst: true,
        subtotal: true,
      },
    });

    const result = { taxableAmount: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, gstCollected: 0 };

    for (const inv of invoices) {
      result.taxableAmount += Number(inv.subtotal);
      result.cgstTotal += Number(inv.cgst || 0);
      result.sgstTotal += Number(inv.sgst || 0);
      result.igstTotal += Number(inv.igst || 0);
    }

    result.gstCollected = result.cgstTotal + result.sgstTotal + result.igstTotal;

    return {
      branchId,
      ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, parseFloat(v.toFixed(2))])),
      invoiceCount: invoices.length,
    };
  }
}

export default new GstAggregationService();
