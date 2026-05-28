import prisma from "../../../config/prisma.js";

class ReconciliationService {
  /**
   * Reconcile Sales vs Invoices
   * Checks if total amount in Sales matches corresponding Invoices
   */
  async reconcileSalesInvoices(tenantId, fromDate, toDate) {
    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: {
          gte: new Date(fromDate),
          lte: new Date(toDate)
        }
      },
      include: { invoice: true }
    });

    const mismatches = [];
    sales.forEach(sale => {
      if (sale.invoice && Math.abs(sale.totalAmount - sale.invoice.totalAmount) > 0.01) {
        mismatches.push({
          saleId: sale.id,
          invoiceId: sale.invoice.id,
          invoiceNumber: sale.invoice.invoiceNumber,
          saleAmount: sale.totalAmount,
          invoiceAmount: sale.invoice.totalAmount,
          difference: sale.totalAmount - sale.invoice.totalAmount
        });
      }
    });

    return {
      totalChecked: sales.length,
      mismatchCount: mismatches.length,
      mismatches
    };
  }

  /**
   * Generate a basic Profit & Loss summary
   */
  async getProfitLossSummary(tenantId, fromDate, toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    // 1. Revenue (Sales)
    const salesAgg = await prisma.sale.aggregate({
      where: { tenantId, soldAt: { gte: from, lte: to }, status: 'COMPLETED' },
      _sum: { totalAmount: true, subtotal: true }
    });

    // 2. COGS (Cost of Goods Sold - based on purchase price of sold items)
    // Simplified: Using purchasePrice from InventoryBatch related to SaleItems
    const saleItems = await prisma.saleItem.findMany({
      where: { sale: { tenantId, soldAt: { gte: from, lte: to }, status: 'COMPLETED' } },
      include: { batch: true }
    });

    let cogs = 0;
    saleItems.forEach(item => {
      cogs += (item.batch?.purchasePrice || 0) * item.quantity;
    });

    // 3. Expenses
    const expensesAgg = await prisma.expense.aggregate({
      where: { tenantId, expenseDate: { gte: from, lte: to } },
      _sum: { amount: true }
    });

    const revenue = salesAgg._sum.subtotal || 0; // Use subtotal (pre-tax) for real P&L
    const grossProfit = revenue - cogs;
    const totalExpenses = expensesAgg._sum.amount || 0;
    const netProfit = grossProfit - totalExpenses;

    return {
      period: { from, to },
      revenue,
      cogs,
      grossProfit,
      totalExpenses,
      netProfit,
      margin: revenue > 0 ? (netProfit / revenue) * 100 : 0
    };
  }
}

export default new ReconciliationService();
