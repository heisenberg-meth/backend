import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';

class DashboardService {
  /**
   * Get daily financial summary (Gross, Net, Tax)
   */
  async getDailySummary(tenantId, branchId, date) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    if (branchId) {
      const summary = await prisma.dailySalesSummary.findUnique({
        where: {
          tenantId_branchId_salesDate: {
            tenantId,
            branchId,
            salesDate: targetDate,
          },
        },
      });

      if (!summary) return this._emptySummary(targetDate);

      return {
        date: summary.salesDate,
        summary: {
          totalSales: Number(summary.totalSales),
          totalInvoices: summary.totalInvoices,
          totalRefunds: Number(summary.totalReturns),
          netRevenue: Number(summary.totalSales) - Number(summary.totalReturns),
        },
        taxSummary: {
          totalGst: Number(summary.totalGst),
        },
      };
    } else {
      // Tenant-level aggregation
      const summaries = await prisma.dailySalesSummary.findMany({
        where: {
          tenantId,
          salesDate: targetDate,
        },
      });

      if (summaries.length === 0) return this._emptySummary(targetDate);

      const totalSales = summaries.reduce((sum, s) => sum + Number(s.totalSales), 0);
      const totalInvoices = summaries.reduce((sum, s) => sum + s.totalInvoices, 0);
      const totalRefunds = summaries.reduce((sum, s) => sum + Number(s.totalReturns), 0);
      const totalGst = summaries.reduce((sum, s) => sum + Number(s.totalGst), 0);

      return {
        date: targetDate,
        summary: {
          totalSales,
          totalInvoices,
          totalRefunds,
          netRevenue: totalSales - totalRefunds,
        },
        taxSummary: {
          totalGst,
        },
      };
    }
  }

  async getPaymentBreakdown(tenantId, branchId, date) {
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const analytics = await prisma.paymentMethodAnalytics.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        paymentDate: targetDate,
      },
    });

    const grouped = {};
    for (const item of analytics) {
      const method = item.paymentMethod;
      if (!grouped[method]) {
        grouped[method] = { amount: 0, count: 0 };
      }
      grouped[method].amount += Number(item.totalAmount);
      grouped[method].count += item.totalCount;
    }

    const totalRevenue = Object.values(grouped).reduce((sum, item) => sum + item.amount, 0);

    return {
      date: targetDate,
      totalRevenue,
      payments: Object.entries(grouped).map(([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
        percentage: totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0,
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
