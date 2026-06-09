import prisma from '../../../config/prisma.js';

class DailySummaryRepository {
  // Sales Summaries
  async upsertSalesSummary(data) {
    // We allow branchId to be null for tenant-wide summaries or when branch is unknown
    const branchId = data.branchId || null;

    return prisma.dailySalesSummary.upsert({
      where: {
        tenantId_branchId_salesDate: {
          tenantId: data.tenantId,
          branchId,
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
