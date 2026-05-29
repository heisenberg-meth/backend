import prisma from "../../../config/prisma.js";
import dailySummaryRepository from '../repositories/daily_summary.repository.js';

class ReportQueryService {
  async getSalesReportData(tenantId, from, to) {
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const summaries = await dailySummaryRepository.getSalesSummaries(tenantId, fromDate, toDate);

    let totalRevenue = 0;
    let totalBills = 0;
    let totalReturns = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;

    const chart = summaries.map(s => {
      const rev = Number(s.totalSales || 0);
      const bills = Number(s.totalInvoices || 0);
      const ret = Number(s.totalReturns || 0);
      
      totalRevenue += rev;
      totalBills += bills;
      totalReturns += ret;
      cashSales += Number(s.cashSales || 0);
      upiSales += Number(s.upiSales || 0);
      cardSales += Number(s.cardSales || 0);

      return {
        date: s.salesDate.toISOString().split('T')[0],
        revenue: rev,
        bills
      };
    });

    const avgBillValue = totalBills > 0 ? totalRevenue / totalBills : 0;

    let revenueTrend = 0;
    let avgBillTrend = 0;
    if (summaries.length > 1) {
      const mid = Math.floor(summaries.length / 2);
      const firstHalf = summaries.slice(0, mid);
      const secondHalf = summaries.slice(mid);
      
      const sumFirst = firstHalf.reduce((sum, d) => sum + Number(d.totalSales || 0), 0);
      const sumSecond = secondHalf.reduce((sum, d) => sum + Number(d.totalSales || 0), 0);
      revenueTrend = sumFirst > 0 ? ((sumSecond - sumFirst) / sumFirst) * 100 : 0;

      const billsFirst = firstHalf.reduce((sum, d) => sum + Number(d.totalInvoices || 0), 0);
      const billsSecond = secondHalf.reduce((sum, d) => sum + Number(d.totalInvoices || 0), 0);
      const avgFirst = billsFirst > 0 ? sumFirst / billsFirst : 0;
      const avgSecond = billsSecond > 0 ? sumSecond / billsSecond : 0;
      avgBillTrend = avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0;
    }

    const topSellingGroups = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: {
        sale: {
          tenantId,
          soldAt: { gte: fromDate, lte: toDate },
          status: { in: ['COMPLETED'] }
        }
      },
      _sum: {
        totalAmount: true,
        quantity: true
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc'
        }
      },
      take: 10
    });

    const medicineIds = topSellingGroups.map(g => g.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { tenantId, id: { in: medicineIds } },
      select: { id: true, name: true }
    });
    const medNameMap = Object.fromEntries(medicines.map(m => [m.id, m.name]));

    const topMedicines = topSellingGroups.map(g => ({
      medicineName: medNameMap[g.medicineId] || 'Unknown',
      revenue: Number(g._sum.totalAmount || 0),
      quantitySold: g._sum.quantity || 0
    }));

    return {
      summary: {
        totalRevenue,
        totalBills,
        avgBillValue,
        totalReturns
      },
      trend: {
        revenueTrend,
        avgBillTrend
      },
      chart,
      paymentDistribution: {
        cash: cashSales,
        upi: upiSales,
        card: cardSales
      },
      topMedicines
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
        invoiceDate: { gte: fromDate, lte: toDate }
      },
      _sum: {
        totalAmount: true,
        balanceAmount: true
      },
      _count: {
        id: true,
        supplierId: true
      }
    });

    const totalAmount = Number(purchaseStats._sum.totalAmount || 0);
    const pendingAmount = Number(purchaseStats._sum.balanceAmount || 0);

    // Optimized: Use groupBy for supplier spend
    const supplierGroups = await prisma.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: {
        tenantId,
        invoiceDate: { gte: fromDate, lte: toDate }
      },
      _sum: {
        totalAmount: true
      },
      orderBy: {
        _sum: {
          totalAmount: 'desc'
        }
      },
      take: 10
    });

    const supplierIds = supplierGroups.map(g => g.supplierId);
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, id: { in: supplierIds } },
      select: { id: true, name: true }
    });
    const suppNameMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

    const maxAmt = Math.max(...supplierGroups.map(g => Number(g._sum.totalAmount || 0)), 1);
    const supplierSpend = supplierGroups.map(g => ({
      name: suppNameMap[g.supplierId] || 'Unknown',
      amount: Number(g._sum.totalAmount || 0),
      percentage: Math.round((Number(g._sum.totalAmount || 0) / maxAmt) * 100)
    }));

    const comparisonData = summaries.slice(-4).map((d) => Number(d.totalPurchase || 0));

    return {
      summary: {
        totalAmount,
        uniqueSuppliers: supplierGroups.length, // Rough estimate from grouped results
        pendingAmount,
        pendingSuppliers: 0 // Would need another query or more complex groupBy to get exact count of suppliers with balance > 0
      },
      comparisonData,
      supplierSpend
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

    summaries.forEach((d) => {
      revenue += Number(d.totalRevenue || 0);
      cogs += Number(d.totalCogs || 0);
      grossProfit += Number(d.grossProfit || 0);
      totalExpenses += Number(d.totalExpenses || 0);
      netProfit += Number(d.netProfit || 0);
    });

    const safeRevenue = revenue || 1;
    const cogsPct = Math.round((cogs / safeRevenue) * 100);
    const grossProfitPct = Math.round((grossProfit / safeRevenue) * 100);
    const expensePct = Math.round((totalExpenses / safeRevenue) * 100);
    const netMargin = Math.round((netProfit / safeRevenue) * 100);

    // P1 Fix: Use groupBy for expense categories
    const expenseGroups = await prisma.expense.groupBy({
      by: ['categoryId', 'categoryName'],
      where: {
        tenantId,
        expenseDate: { gte: fromDate, lte: toDate }
      },
      _sum: {
        amount: true
      }
    });

    const categoryIds = expenseGroups.map(g => g.categoryId).filter(id => id !== null);
    const categories = await prisma.expenseCategory.findMany({
      where: { tenantId, id: { in: categoryIds } },
      select: { id: true, name: true }
    });
    const catNameMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const expensesDistribution = expenseGroups.map((group, idx) => {
      const amount = Number(group._sum.amount || 0);
      const name = catNameMap[group.categoryId] || group.categoryName || "Operational";
      const pct = Math.round((amount / (totalExpenses || 1)) * 100);
      return {
        name,
        amount,
        percentage: pct,
        color:
          idx % 3 === 0
            ? "var(--info)"
            : idx % 3 === 1
              ? "var(--warning)"
              : "var(--success)"
      };
    }).sort((a, b) => b.amount - a.amount);

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
        expensePct
      },
      expensesDistribution
    };
  }
}

export default new ReportQueryService();
