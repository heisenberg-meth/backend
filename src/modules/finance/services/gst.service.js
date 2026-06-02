import prisma from '../../../config/prisma.js';
import accountingRepository from '../repositories/accounting.repository.js';

class GstService {
  /**
   * Calculate detailed GST breakdown
   * For India: CGST/SGST for intrastate, IGST for interstate
   */
  calculateGstBreakdown(amount, gstPercentage, isInterstate = false) {
    const totalGst = (amount * gstPercentage) / 100;

    if (isInterstate) {
      return {
        totalGst: parseFloat(totalGst.toFixed(2)),
        cgst: 0,
        sgst: 0,
        igst: parseFloat(totalGst.toFixed(2)),
      };
    } else {
      const halfGst = totalGst / 2;
      return {
        totalGst: parseFloat(totalGst.toFixed(2)),
        cgst: parseFloat(halfGst.toFixed(2)),
        sgst: parseFloat(halfGst.toFixed(2)),
        igst: 0,
      };
    }
  }

  async generateMonthlySummary(tenantId, monthDate) {
    const startOfMonth = new Date(monthDate);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: { gte: startOfMonth, lt: endOfMonth },
        status: 'COMPLETED',
      },
      include: { items: true },
    });

    let totalSalesGst = 0;
    let outputTax = 0;

    sales.forEach((sale) => {
      totalSalesGst += sale.gstAmount;
      outputTax += sale.gstAmount;
    });

    const purchases = await prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: startOfMonth, lt: endOfMonth },
      },
    });

    let totalPurchaseGst = 0;
    let inputTaxCredit = 0;

    purchases.forEach((inv) => {
      totalPurchaseGst += inv.gstAmount;
      inputTaxCredit += inv.gstAmount;
    });

    const netGstPayable = outputTax - inputTaxCredit;

    return accountingRepository.upsertGstSummary(tenantId, startOfMonth, {
      totalSalesGst,
      totalPurchaseGst,
      outputTax,
      inputTaxCredit,
      netGstPayable,
    });
  }

  async getGstHistory(tenantId) {
    return accountingRepository.findGstSummaries(tenantId);
  }
}

export default new GstService();
