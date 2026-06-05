import prisma from '../../../config/prisma.js';

class SummaryRepository {
  async upsertDailySummary(data) {
    return prisma.dailySalesSummary.upsert({
      where: {
        tenantId_salesDate: {
          tenantId: data.tenantId,
          salesDate: data.salesDate,
        },
      },
      update: {
        totalSales: data.totalSales,
        totalInvoices: data.totalInvoices,
        totalItemsSold: data.totalItemsSold,
        totalDiscount: data.totalDiscount,
        totalGst: data.totalGst,
        cashSales: data.cashSales,
        cardSales: data.cardSales,
        upiSales: data.upiSales,
      },
      create: data,
    });
  }

  async getSummaries(tenantId, fromDate, toDate) {
    return prisma.dailySalesSummary.findMany({
      where: {
        tenantId,
        salesDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      orderBy: { salesDate: 'asc' },
    });
  }
}

export default new SummaryRepository();
