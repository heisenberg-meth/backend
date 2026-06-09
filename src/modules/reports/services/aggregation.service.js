import prisma from '../../../config/prisma.js';
import dailySummaryRepository from '../repositories/daily_summary.repository.js';
import logger from '../../../shared/utils/logger.js';

class AggregationService {
  /**
   * Aggregates all data for a specific date and tenant
   */
  async runDailyAggregation(tenantId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      await Promise.all([
        this.aggregateSales(tenantId, startOfDay, endOfDay),
        this.aggregatePurchases(tenantId, startOfDay, endOfDay),
        this.aggregateFinance(tenantId, startOfDay, endOfDay),
      ]);
      logger.info(`Aggregation complete for tenant ${tenantId} on ${startOfDay.toDateString()}`);
    } catch (err) {
      logger.error({ err }, `Aggregation failed for tenant ${tenantId}`);
      throw err;
    }
  }

  async aggregateSales(tenantId, start, end) {
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: { gte: start, lte: end },
        status: { in: ['COMPLETED'] },
      },
      include: { salesReturns: true },
    });

    // Group sales by branchId so each branch gets its own summary row
    const branchGroups = {};
    for (const s of sales) {
      const bid = s.branchId || '__no_branch__';
      if (!branchGroups[bid]) {
        branchGroups[bid] = {
          totalSales: 0,
          totalInvoices: 0,
          totalItemsSold: 0,
          totalDiscount: 0,
          totalGst: 0,
          totalReturns: 0,
          cashSales: 0,
          cardSales: 0,
          upiSales: 0,
        };
      }
      const acc = branchGroups[bid];
      const amt = Number(s.totalAmount || 0);
      acc.totalSales += amt;
      acc.totalInvoices += 1;
      acc.totalItemsSold += s.totalItems || 0;
      acc.totalDiscount += Number(s.discountAmount || 0);
      acc.totalGst += Number(s.gstAmount || 0);
      acc.totalReturns += s.salesReturns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);

      if (s.paymentMethod === 'CASH') acc.cashSales += amt;
      else if (s.paymentMethod === 'CARD') acc.cardSales += amt;
      else if (s.paymentMethod === 'UPI') acc.upiSales += amt;
    }

    const results = [];
    for (const [bid, totals] of Object.entries(branchGroups)) {
      const branchId = bid === '__no_branch__' ? null : bid;
      const result = await dailySummaryRepository.upsertSalesSummary({
        tenantId,
        branchId,
        salesDate: start,
        ...totals,
      });
      results.push(result);
    }

    // If no sales exist for this date, still create a zero-value summary
    if (results.length === 0) {
      const defaultBranch = await prisma.branch.findFirst({ where: { tenantId } });
      if (defaultBranch) {
        const result = await dailySummaryRepository.upsertSalesSummary({
          tenantId,
          branchId: defaultBranch.id,
          salesDate: start,
          totalSales: 0,
          totalInvoices: 0,
          totalItemsSold: 0,
          totalDiscount: 0,
          totalGst: 0,
          totalReturns: 0,
          cashSales: 0,
          cardSales: 0,
          upiSales: 0,
        });
        results.push(result);
      }
    }

    return results;
  }

  async aggregatePurchases(tenantId, start, end) {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: start, lte: end },
      },
    });

    const returns = await prisma.supplierReturn.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
      },
      include: { batch: true },
    });

    const totalPurchase = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
    const totalReturns = returns.reduce(
      (sum, ret) => sum + ret.quantity * Number(ret.batch?.purchasePrice || 0),
      0,
    );
    const totalInputGst = invoices.reduce((sum, inv) => sum + Number(inv.gstAmount || 0), 0);
    const uniqueSuppliers = new Set(invoices.map((inv) => inv.supplierId).filter(Boolean)).size;

    return dailySummaryRepository.upsertPurchaseSummary({
      tenantId,
      reportDate: start,
      totalPurchase,
      totalOrders: invoices.length,
      totalSuppliers: uniqueSuppliers,
      totalReturns,
      totalInputGst,
    });
  }

  async aggregateFinance(tenantId, start, end) {
    // Finance Summary: Revenue, COGS, Profit
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: { gte: start, lte: end },
        status: { in: ['COMPLETED'] },
      },
      include: {
        items: {
          include: { batch: true },
        },
      },
    });

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalDiscount = 0;

    for (const sale of sales) {
      totalRevenue += Number(sale.subtotal || 0); // Revenue before discount/tax for margin calc
      totalDiscount += Number(sale.discountAmount || 0);

      for (const item of sale.items) {
        // COGS = quantity * purchase price of that specific batch
        totalCogs += (item.quantity || 0) * Number(item.batch?.purchasePrice || 0);
      }
    }

    const grossProfit = totalRevenue - totalDiscount - totalCogs;

    // Dynamic expense calculation
    const expensesAgg = await prisma.expense.aggregate({
      where: {
        tenantId,
        expenseDate: { gte: start, lte: end },
      },
      _sum: {
        amount: true,
      },
    });
    const totalExpenses = Number(expensesAgg._sum.amount || 0);
    const netProfit = grossProfit - totalExpenses;

    return dailySummaryRepository.upsertFinanceSummary({
      tenantId,
      reportDate: start,
      totalRevenue: totalRevenue - totalDiscount,
      totalCogs,
      grossProfit,
      totalExpenses,
      netProfit,
    });
  }
}

export default new AggregationService();
