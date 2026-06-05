import prisma from '../../../config/prisma.js';

class DailySummaryRepository {
  // Sales Summaries
  async upsertSalesSummary(data) {
    if (!data.branchId) {
      console.warn('Skipping DailySalesSummary because branchId is missing', data);
      return null;
    }

    return prisma.dailySalesSummary.upsert({
      where: {
        tenantId_branchId_salesDate: {
          tenantId: data.tenantId,
          branchId: data.branchId,
          salesDate: data.salesDate,
        },
      },
      update: data,
      create: data,
    });
  }

  async getSalesSummaries(tenantId, fromDate, toDate) {
    return prisma.dailySalesSummary.findMany({
      where: {
        tenantId,
        salesDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { salesDate: 'asc' },
    });
  }

  // Purchase Summaries
  async upsertPurchaseSummary(data) {
    return prisma.dailyPurchaseSummary.upsert({
      where: {
        tenantId_reportDate: {
          tenantId: data.tenantId,
          reportDate: data.reportDate,
        },
      },
      update: data,
      create: data,
    });
  }

  async getPurchaseSummaries(tenantId, fromDate, toDate) {
    return prisma.dailyPurchaseSummary.findMany({
      where: {
        tenantId,
        reportDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { reportDate: 'asc' },
    });
  }

  // Finance Summaries (P&L)
  async upsertFinanceSummary(data) {
    return prisma.dailyFinanceSummary.upsert({
      where: {
        tenantId_reportDate: {
          tenantId: data.tenantId,
          reportDate: data.reportDate,
        },
      },
      update: data,
      create: data,
    });
  }

  async getFinanceSummaries(tenantId, fromDate, toDate) {
    return prisma.dailyFinanceSummary.findMany({
      where: {
        tenantId,
        reportDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { reportDate: 'asc' },
    });
  }
}

export default new DailySummaryRepository();
