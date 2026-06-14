import analyticsService from '../service/analytics.prisma.service.js';
import prisma from '../../../config/prisma.js';
import { initRedis } from '../../../config/redis.js';

const redisClient = initRedis();

class AnalyticsFastifyController {
  _branchFilter(tenantId, branchId) {
    const filter = { tenantId };
    if (branchId) {
      filter.branchId = branchId;
    }
    return filter;
  }

  async getDashboardStats(request, reply) {
    try {
      const data = await analyticsService.getDashboardStats(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-dashboard-stats' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getInventoryDistribution(request, reply) {
    try {
      const data = await analyticsService.getInventoryDistribution(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-inventory-dist' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getRevenueVsCost(request, reply) {
    try {
      const data = await analyticsService.getRevenueVsCost(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-revenue-cost' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSupplierSpend(request, reply) {
    try {
      const data = await analyticsService.getSupplierSpend(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-supplier-spend' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getLowStockTrends(request, reply) {
    try {
      const data = await analyticsService.getLowStockTrends(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-low-stock-trends' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSlowMovingStock(request, reply) {
    try {
      const data = await analyticsService.getSlowMovingStock(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-slow-moving' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getTopSellingMedicines(request, reply) {
    try {
      const data = await analyticsService.getTopSellingMedicines(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-top-selling' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getExpiryLossReport(request, reply) {
    try {
      const data = await analyticsService.getExpiryLossReport(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-expiry-loss' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getProfitMargin(request, reply) {
    try {
      const data = await analyticsService.getProfitMargin(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-profit-margin' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getStaffSales(request, reply) {
    try {
      const data = await analyticsService.getStaffSales(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-staff-sales' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getPaymentMethods(request, reply) {
    try {
      const data = await analyticsService.getPaymentMethods(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-payment-methods' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getHourlySales(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-hourly-sales' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getFraudSignals(request, reply) {
    try {
      const { tenantId } = request;
      const data = await analyticsService.getFraudSignals(tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-fraud-signals' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getForecastDashboard(request, reply) {
    try {
      const { tenantId } = request;
      const data = await analyticsService.getForecastDashboard(tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-forecast' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getBranchPerformance(request, reply) {
    try {
      const { tenantId } = request;
      const data = await analyticsService.getBranchPerformance(tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'analytics-branch-perf' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getFastMoving(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'bi-fast-moving' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSlowMovingBI(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'bi-slow-moving' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getDeadStock(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'bi-dead-stock' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getRevenueHeatmap(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'bi-revenue-heatmap' }, 'Analytics error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new AnalyticsFastifyController();
