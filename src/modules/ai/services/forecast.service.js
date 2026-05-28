import prisma from '../../../config/prisma.js';

class DemandForecastService {
  /**
   * Forecast future medicine demand (e.g. for next 30 days)
   * Formula: Moving Average + Trend + Recent Bias
   */
  async forecastDemand(medicineId, tenantId, forecastDays = 30) {
    const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) throw new Error('Medicine not found');

    // 1. Fetch historical sales by day (last 6 months)
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

    // 2. Aggregate by month to see Trend
    const monthlySales = {};
    historicalSales.forEach(sale => {
      const month = sale.invoice.createdAt.toISOString().slice(0, 7); // YYYY-MM
      monthlySales[month] = (monthlySales[month] || 0) + sale.quantity;
    });

    const months = Object.keys(monthlySales).sort();
    let trend = 1.0; // Flat
    if (months.length >= 2) {
      const lastMonth = monthlySales[months[months.length - 1]];
      const prevMonth = monthlySales[months[months.length - 2]];
      if (prevMonth > 0) trend = lastMonth / prevMonth;
    }

    // Limit trend to reasonable bounds (0.5 to 1.5)
    trend = Math.max(0.5, Math.min(1.5, trend));

    // 3. Recent consumption (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const recentTotal = historicalSales
      .filter(s => s.invoice.createdAt >= fourteenDaysAgo)
      .reduce((sum, s) => sum + s.quantity, 0);
    
    const recentDailyAvg = recentTotal / 14;

    // 4. Overall daily average
    const totalQty = historicalSales.reduce((sum, s) => sum + s.quantity, 0);
    const overallDailyAvg = totalQty / (6 * 30); // simplistic

    // 5. Final Prediction
    // Weighted: 70% recent, 30% overall, multiplied by trend
    const dailyForecast = ((recentDailyAvg * 0.7) + (overallDailyAvg * 0.3)) * trend;
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
