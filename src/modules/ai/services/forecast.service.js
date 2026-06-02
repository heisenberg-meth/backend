import prisma from '../../../config/prisma.js';

class DemandForecastService {
  async forecastDemand(medicineId, tenantId, forecastDays = 30) {
    const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw new Error('Medicine not found');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const historicalSales = await prisma.invoiceItem.findMany({
      where: {
        medicineId,
        invoice: {
          tenantId,
          createdAt: { gte: sixMonthsAgo },
          status: 'COMPLETED',
        },
      },
      include: { invoice: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlySales = {};
    historicalSales.forEach((sale) => {
      const month = sale.invoice.createdAt.toISOString().slice(0, 7);
      monthlySales[month] = (monthlySales[month] || 0) + sale.quantity;
    });

    const months = Object.keys(monthlySales).sort();
    let trend = 1.0;
    if (months.length >= 2) {
      const lastMonth = monthlySales[months[months.length - 1]];
      const prevMonth = monthlySales[months[months.length - 2]];
      if (prevMonth > 0) trend = lastMonth / prevMonth;
    }

    trend = Math.max(0.5, Math.min(1.5, trend));

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const recentTotal = historicalSales
      .filter((s) => s.invoice.createdAt >= fourteenDaysAgo)
      .reduce((sum, s) => sum + s.quantity, 0);

    const recentDailyAvg = recentTotal / 14;

    const totalQty = historicalSales.reduce((sum, s) => sum + s.quantity, 0);
    const overallDailyAvg = totalQty / (6 * 30);

    const dailyForecast = (recentDailyAvg * 0.7 + overallDailyAvg * 0.3) * trend;
    const predictedDemand = Math.ceil(dailyForecast * forecastDays);

    return {
      medicineId,
      forecastDays,
      predictedDemand,
      trend: parseFloat(trend.toFixed(2)),
      dailyAverage: parseFloat(dailyForecast.toFixed(2)),
      confidence: historicalSales.length > 20 ? 0.8 : 0.4,
    };
  }
}

export default new DemandForecastService();
