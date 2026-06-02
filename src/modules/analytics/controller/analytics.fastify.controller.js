import analyticsService from '../service/analytics.prisma.service.js';
import prisma from '../../../config/prisma.js';
import { initRedis } from '../../../config/redis.js';

const redisClient = initRedis();

class AnalyticsFastifyController {
  _branchFilter(tenantId, branchId) {
    if (branchId) {
      return { tenantId, branchId };
    }
    return { tenantId, branchId: null };
  }

  async getDashboardStats(request, reply) {
    const data = await analyticsService.getDashboardStats(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getInventoryDistribution(request, reply) {
    const data = await analyticsService.getInventoryDistribution(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getRevenueVsCost(request, reply) {
    const data = await analyticsService.getRevenueVsCost(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getSupplierSpend(request, reply) {
    const data = await analyticsService.getSupplierSpend(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getLowStockTrends(request, reply) {
    const data = await analyticsService.getLowStockTrends(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getSlowMovingStock(request, reply) {
    const data = await analyticsService.getSlowMovingStock(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getTopSellingMedicines(request, reply) {
    const data = await analyticsService.getTopSellingMedicines(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getExpiryLossReport(request, reply) {
    const data = await analyticsService.getExpiryLossReport(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getProfitMargin(request, reply) {
    const data = await analyticsService.getProfitMargin(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getStaffSales(request, reply) {
    const data = await analyticsService.getStaffSales(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getPaymentMethods(request, reply) {
    const data = await analyticsService.getPaymentMethods(request.tenantId);
    return reply.send({ success: true, data });
  }

  async getHourlySales(request, reply) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: {
        tenantId: request.tenantId,
        soldAt: { gte: startOfDay },
      },
    });

    const hourly = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${i % 12 || 12} ${i < 12 ? 'AM' : 'PM'}`,
      revenue: 0,
      count: 0,
    }));

    sales.forEach((s) => {
      const h = new Date(s.soldAt).getHours();
      hourly[h].revenue += Number(s.totalAmount || 0);
      hourly[h].count += 1;
    });

    return reply.send({ success: true, data: hourly });
  }

  async getFraudSignals(request, reply) {
    const { tenantId } = request;
    const data = await analyticsService.getFraudSignals(tenantId);
    return reply.send({ success: true, data });
  }

  async getForecastDashboard(request, reply) {
    const { tenantId } = request;
    const data = await analyticsService.getForecastDashboard(tenantId);
    return reply.send({ success: true, data });
  }

  async getBranchPerformance(request, reply) {
    const { tenantId } = request;
    const data = await analyticsService.getBranchPerformance(tenantId);
    return reply.send({ success: true, data });
  }

  async getFastMoving(request, reply) {
    const { tenantId } = request;
    const branchId = request.query?.branchId || null;
    const filter = this._branchFilter(tenantId, branchId);
    const cacheKey = `bi:fast-moving:${tenantId}:${branchId || 'all'}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return reply.send({ success: true, data: JSON.parse(cached) });

    const where = { ...filter };
    const data = await prisma.fastMovingMedicine.findMany({
      where,
      orderBy: { ranking: 'asc' },
      take: 50,
      include: { medicine: { select: { name: true, genericName: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return reply.send({ success: true, data });
  }

  async getSlowMovingBI(request, reply) {
    const { tenantId } = request;
    const branchId = request.query?.branchId || null;
    const filter = this._branchFilter(tenantId, branchId);
    const cacheKey = `bi:slow-moving:${tenantId}:${branchId || 'all'}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return reply.send({ success: true, data: JSON.parse(cached) });

    const where = { ...filter };
    const data = await prisma.slowMovingStock.findMany({
      where,
      orderBy: { daysSinceLastSale: 'desc' },
      include: { medicine: { select: { name: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return reply.send({ success: true, data });
  }

  async getDeadStock(request, reply) {
    const { tenantId } = request;
    const branchId = request.query?.branchId || null;
    const filter = this._branchFilter(tenantId, branchId);
    const cacheKey = `bi:dead-stock:${tenantId}:${branchId || 'all'}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return reply.send({ success: true, data: JSON.parse(cached) });

    const where = { ...filter };
    const data = await prisma.deadStockAnalysis.findMany({
      where,
      orderBy: { stockValue: 'desc' },
      include: { medicine: { select: { name: true } } },
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return reply.send({ success: true, data });
  }

  async getRevenueHeatmap(request, reply) {
    const { tenantId } = request;
    const branchId = request.query?.branchId || null;
    const filter = this._branchFilter(tenantId, branchId);
    const cacheKey = `bi:revenue-heatmap:${tenantId}:${branchId || 'all'}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) return reply.send({ success: true, data: JSON.parse(cached) });

    const where = { ...filter };
    const data = await prisma.revenueHeatmap.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { hourSlot: 'asc' }],
    });

    await redisClient.set(cacheKey, JSON.stringify(data), 'EX', 3600);
    return reply.send({ success: true, data });
  }
}

export default new AnalyticsFastifyController();
