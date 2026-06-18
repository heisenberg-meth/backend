import prisma from '../../../config/prisma.js';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

class FinancialMetricsService {
  /**
   * Centralized method to calculate revenue, returns, and net profit
   * for a given date range.
   */
  async getMetrics(tenantId, branchId = null, startDate = null, endDate = null) {
    if (!tenantId) throw new Error('Tenant missing');

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const whereSales = { tenantId, status: { notIn: ['CANCELLED', 'VOID'] } };
    const whereReturns = { tenantId, status: 'APPROVED' };

    if (branchId) {
      whereSales.branchId = branchId;
      whereReturns.branchId = branchId;
    }

    if (Object.keys(dateFilter).length > 0) {
      whereSales.createdAt = dateFilter;
      whereReturns.createdAt = dateFilter;
    }

    const [salesAggregate, returnsAggregate] = await Promise.all([
      prisma.sale.aggregate({
        where: whereSales,
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.return.aggregate({
        where: whereReturns,
        _sum: { totalReturnAmount: true },
        _count: { id: true },
      }),
    ]);

    const totalRevenue = Number(Number(salesAggregate._sum.totalAmount || 0).toFixed(2));
    const totalReturns = Number(Number(returnsAggregate._sum.totalReturnAmount || 0).toFixed(2));
    const netProfit = Number((totalRevenue - totalReturns).toFixed(2));

    return {
      totalRevenue,
      totalReturns,
      netProfit,
      salesCount: salesAggregate._count.id || 0,
      returnsCount: returnsAggregate._count.id || 0,
    };
  }

  async getTodayMetrics(tenantId, branchId = null) {
    const today = new Date();
    return this.getMetrics(tenantId, branchId, startOfDay(today), endOfDay(today));
  }

  async getMonthMetrics(tenantId, branchId = null) {
    const today = new Date();
    return this.getMetrics(tenantId, branchId, startOfMonth(today), endOfMonth(today));
  }
}

export default new FinancialMetricsService();
