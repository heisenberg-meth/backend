import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';

class DashboardService {
  /**
   * Get daily financial summary (Gross, Net, Tax)
   */
  async getDailySummary(tenantId, branchId, date) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const summary = await prisma.dailySalesSummary.findUnique({
      where: {
        tenantId_branchId_salesDate: {
          tenantId,
          branchId: branchId || null,
          salesDate: targetDate,
        },
      },
    });

    if (!summary) return this._emptySummary(targetDate);

    return {
      date: summary.salesDate,
      summary: {
        totalSales: summary.totalSales,
        totalInvoices: summary.totalInvoices,
        totalRefunds: summary.totalReturns,
        netRevenue: summary.totalSales - summary.totalReturns,
      },
      taxSummary: {
        totalGst: summary.totalGst,
      },
    };
  }

  async getPaymentBreakdown(tenantId, branchId, date) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const analytics = await prisma.paymentMethodAnalytics.findMany({
      where: {
        tenantId,
        branchId: branchId || null,
        paymentDate: targetDate,
      },
    });

    const totalRevenue = analytics.reduce((sum, item) => sum + item.totalAmount, 0);

    return {
      date: targetDate,
      totalRevenue,
      payments: analytics.map((item) => ({
        method: item.paymentMethod,
        amount: item.totalAmount,
        count: item.totalCount,
        percentage: totalRevenue > 0 ? (item.totalAmount / totalRevenue) * 100 : 0,
      })),
    };
  }

  async getTodaySales(tenantId, branchId, limit = 20) {
    const cacheKey = `analytics:today-sales:${tenantId}:${branchId || 'all'}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) return JSON.parse(cachedData);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sales = await prisma.invoice.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        createdAt: { gte: today },
        status: 'ACTIVE',
      },
      select: {
        invoiceNumber: true,
        totalAmount: true,
        paymentMethod: true,
        createdAt: true,
        patient: {
          select: { fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const result = {
      timestamp: new Date(),
      sales: sales.map((s) => ({
        invoiceNumber: s.invoiceNumber,
        customerName: s.patient?.fullName || 'Walk-in Patient',
        amount: s.totalAmount,
        paymentMethod: s.paymentMethod,
        createdAt: s.createdAt,
      })),
    };

    await redisClient.setex(cacheKey, 60, JSON.stringify(result));

    return result;
  }

  async refreshSalesFeed(tenantId, branchId) {
    const cacheKey = `analytics:today-sales:${tenantId}:${branchId || 'all'}`;
    await redisClient.del(cacheKey);
  }

  _emptySummary(date) {
    return {
      date,
      summary: { totalSales: 0, totalInvoices: 0, totalRefunds: 0, netRevenue: 0 },
      taxSummary: { totalGst: 0 },
    };
  }
}

export default new DashboardService();
