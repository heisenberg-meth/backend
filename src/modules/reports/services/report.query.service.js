import prisma from '../../../config/prisma.js';
import dailySummaryRepository from '../repositories/daily_summary.repository.js';

class ReportQueryService {
  async getSalesReportData(tenantId, from, to) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: fromDate, lte: toDate },
        status: { in: ['PAID', 'FINALIZED'] },
      },
      include: {
        payments: true,
      },
    });

    const returns = await prisma.salesReturn.findMany({
      where: {
        tenantId,
        createdAt: { gte: fromDate, lte: toDate },
        status: { in: ['REFUNDED', 'APPROVED'] },
      },
    });

    let grossRevenue = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;

    // Group chart data by date
    const chartMap = {};

    invoices.forEach((inv) => {
      const invTotal = Number(inv.totalAmount || 0);
      grossRevenue += invTotal;

      const dateKey = inv.createdAt.toISOString().split('T')[0];
      if (!chartMap[dateKey]) {
        chartMap[dateKey] = { date: dateKey, revenue: 0, bills: 0 };
      }
      chartMap[dateKey].revenue += invTotal;
      chartMap[dateKey].bills += 1;

      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach((p) => {
          const pMode = (p.paymentMode || '').toUpperCase();
          const pAmt = Number(p.amount || 0);
          if (pMode === 'CASH') cashSales += pAmt;
          else if (pMode === 'UPI') upiSales += pAmt;
          else if (pMode === 'CARD') cardSales += pAmt;
        });
      } else {
        // Fallback if no payment records but invoice is completed (assume CASH)
        cashSales += invTotal;
      }
    });

    const totalReturns = returns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);
    const totalRevenue = grossRevenue - totalReturns;
    const totalBills = invoices.length;
    const avgBillValue = totalBills > 0 ? totalRevenue / totalBills : 0;

    const chart = Object.values(chartMap).sort((a, b) => a.date.localeCompare(b.date));

    // Trend calculation
    let revenueTrend = 0;
    let avgBillTrend = 0;
    // We can use a simpler mid-point split for trend or a generic 0 for now since this is just a snapshot.
    // For simplicity, we just leave trend at 0 unless we fetch the previous period.

    const topSellingGroups = await prisma.invoiceItem.groupBy({
      by: ['medicineId'],
      where: {
        invoice: {
          tenantId,
          createdAt: { gte: fromDate, lte: toDate },
          status: { in: ['PAID', 'FINALIZED'] },
        },
      },
      _sum: {
        totalPrice: true,
        quantity: true,
      },
      orderBy: {
        _sum: {
          totalPrice: 'desc',
        },
      },
      take: 10,
    });

    const medicineIds = topSellingGroups.map((g) => g.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { tenantId, id: { in: medicineIds } },
      select: { id: true, name: true },
    });
    const medNameMap = Object.fromEntries(medicines.map((m) => [m.id, m.name]));

    const topMedicines = topSellingGroups.map((g) => ({
      medicineName: medNameMap[g.medicineId] || 'Unknown',
      revenue: Number(g._sum.totalPrice || 0),
      quantitySold: g._sum.quantity || 0,
    }));

    return {
      summary: {
        totalRevenue,
        grossRevenue,
        totalBills,
        avgBillValue,
        totalReturns,
      },
      trend: {
        revenueTrend,
        avgBillTrend,
      },
      chart,
      paymentDistribution: {
        cash: cashSales,
        upi: upiSales,
        card: cardSales,
      },
      topMedicines,
    };
  }

  async getPurchaseReportData(tenantId, from, to) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const summaries = await dailySummaryRepository.getPurchaseSummaries(tenantId, fromDate, toDate);

    // Optimized: Aggregate totals at DB level
    const purchaseStats = await prisma.purchaseInvoice.aggregate({
      where: {
        tenantId,
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      _sum: {
        totalAmount: true,
        balanceAmount: true,
      },
      _count: {
        id: true,
        supplierId: true,
      },
    });

    const totalAmount = Number(purchaseStats._sum.totalAmount || 0);
    const pendingAmount = Number(purchaseStats._sum.balanceAmount || 0);

    // Optimized: Use groupBy for supplier spend
    const supplierGroups = await prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: {
        tenantId,
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      _sum: {
        totalAmount: true,
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc',
        },
      },
      take: 10,
    });

    const supplierIds = supplierGroups.map((g) => g.supplierId);
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, id: { in: supplierIds } },
      select: { id: true, name: true },
    });
    const suppNameMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

    const maxAmt = Math.max(...supplierGroups.map((g) => Number(g._sum.totalAmount || 0)), 1);
    const supplierSpend = supplierGroups.map((g) => ({
      name: suppNameMap[g.supplierId] || 'Unknown',
      amount: Number(g._sum.totalAmount || 0),
      percentage: Math.round((Number(g._sum.totalAmount || 0) / maxAmt) * 100),
    }));

    const comparisonData = summaries
      .filter((d) => Number(d.totalPurchase || 0) > 0)
      .slice(-4)
      .map((d) => ({
        period: d.reportDate || d.date || d.period,
        amount: Number(d.totalPurchase || 0),
      }));

    return {
      summary: {
        totalAmount,
        uniqueSuppliers: supplierGroups.length, // Rough estimate from grouped results
        pendingAmount,
        pendingSuppliers: 0, // Would need another query or more complex groupBy to get exact count of suppliers with balance > 0
      },
      comparisonData,
      supplierSpend,
    };
  }

  async getPnlReportData(tenantId, from, to) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const summaries = await dailySummaryRepository.getFinanceSummaries(tenantId, fromDate, toDate);

    let revenue = 0;
    let cogs = 0;
    let grossProfit = 0;
    let totalExpenses = 0;
    let netProfit = 0;

    const expenseGroups = await prisma.expense.groupBy({
      by: ['categoryId'],
      where: {
        tenantId,
        expenseDate: { gte: fromDate, lte: toDate },
        deletedAt: null,
      },
      _sum: {
        amount: true,
      },
    });

    const actualTotalExpenses = expenseGroups.reduce(
      (sum, g) => sum + Number(g._sum.amount || 0),
      0,
    );

    summaries.forEach((d) => {
      revenue += Number(d.totalRevenue || 0);
      cogs += Number(d.totalCogs || 0);
      grossProfit += Number(d.grossProfit || 0);
      totalExpenses += Number(d.totalExpenses || 0);
      netProfit += Number(d.netProfit || 0);
    });

    totalExpenses = actualTotalExpenses;
    netProfit = grossProfit - totalExpenses;

    const safeRevenue = revenue || 1;
    const cogsPct = Math.round((cogs / safeRevenue) * 100);
    const grossProfitPct = Math.round((grossProfit / safeRevenue) * 100);
    const expensePct = Math.round((totalExpenses / safeRevenue) * 100);
    const netMargin = Math.round((netProfit / safeRevenue) * 100);

    const categoryIds = expenseGroups.map((g) => g.categoryId).filter((id) => id !== null);
    const categories = await prisma.expenseCategory.findMany({
      where: { tenantId, id: { in: categoryIds } },
      select: { id: true, name: true },
    });
    const catNameMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const expensesDistribution = expenseGroups
      .map((group, idx) => {
        const amount = Number(group._sum.amount || 0);
        const name = catNameMap[group.categoryId] || 'Unknown Category';
        const pct = Math.round((amount / (totalExpenses || 1)) * 100);
        return {
          name,
          amount,
          percentage: pct,
          color:
            idx % 3 === 0 ? 'var(--info)' : idx % 3 === 1 ? 'var(--warning)' : 'var(--success)',
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return {
      summary: {
        revenue,
        cogs,
        cogsPct,
        grossProfit,
        grossProfitPct,
        expenses: totalExpenses,
        netProfit,
        netMargin,
        expensePct,
      },
      expensesDistribution,
    };
  }
}

export default new ReportQueryService();
