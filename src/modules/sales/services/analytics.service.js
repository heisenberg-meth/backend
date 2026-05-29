import prisma from "../../../config/prisma.js";
import summaryRepository from '../repositories/summary.repository.js';

class AnalyticsService {
  /**
   * Generate daily summary for a specific date
   */
  async generateDailySummary(tenantId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId,
        soldAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: { in: ['COMPLETED'] },
      },
    });

    const totals = sales.reduce((acc, s) => {
      acc.totalSales += s.totalAmount;
      acc.totalInvoices += 1;
      acc.totalItemsSold += s.totalItems;
      acc.totalDiscount += s.discountAmount;
      acc.totalGst += s.gstAmount;

      if (s.paymentMethod === 'CASH') acc.cashSales += s.totalAmount;
      else if (s.paymentMethod === 'CARD') acc.cardSales += s.totalAmount;
      else if (s.paymentMethod === 'UPI') acc.upiSales += s.totalAmount;

      return acc;
    }, {
      totalSales: 0,
      totalInvoices: 0,
      totalItemsSold: 0,
      totalDiscount: 0,
      totalGst: 0,
      cashSales: 0,
      cardSales: 0,
      upiSales: 0
    });

    return summaryRepository.upsertDailySummary({
      tenantId,
      salesDate: startOfDay,
      ...totals
    });
  }

  async getTrends(tenantId, days = 7) {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    return summaryRepository.getSummaries(tenantId, fromDate, toDate);
  }
}

export default new AnalyticsService();
