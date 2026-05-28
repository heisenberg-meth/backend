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
          status: { in: ['COMPLETED', 'PARTIALLY_RETURNED'] }
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
      where: { id: { in: medicineIds } },
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

    const purchases = await prisma.purchaseInvoice.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: fromDate, lte: toDate }
      },
      include: {
        supplier: true
      }
    });

    let totalAmount = 0;
    let pendingAmount = 0;
    const uniqueSuppliersSet = new Set();
    const pendingSuppliersSet = new Set();

    const suppMap = {};
    for (const p of purchases) {
      const amt = Number(p.totalAmount || 0);
      const balance = Number(p.balanceAmount || 0);
      totalAmount += amt;
      uniqueSuppliersSet.add(p.supplierId);
      if (balance > 0) {
        pendingAmount += balance;
        pendingSuppliersSet.add(p.supplierId);
      }

      const name = p.supplier.name;
      suppMap[name] = (suppMap[name] || 0) + amt;
    }

    const maxAmt = Math.max(...Object.values(suppMap), 1);
    const supplierSpend = Object.entries(suppMap)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: Math.round((amount / maxAmt) * 100)
      }))
      .sort((a, b) => b.amount - a.amount);

    const comparisonData = summaries.slice(-4).map((d) => Number(d.totalPurchase || 0));

    return {
      summary: {
        totalAmount,
        uniqueSuppliers: uniqueSuppliersSet.size,
        pendingAmount,
        pendingSuppliers: pendingSuppliersSet.size
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
      where: { id: { in: categoryIds } },
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
