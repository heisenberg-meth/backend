import prisma from '../../../config/prisma.js';
import { initRedis } from '../../../config/redis.js';
import analyticsService from '../../analytics/service/analytics.service.js';

const redisClient = initRedis();
const CACHE_TTL = 120;

class DashboardService {
  async getOverview(tenantId) {
    const cacheKey = `dashboard:overview:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [kpis, totalCustomers, todaySales, monthSales, activeStockAlerts, activeExpiryAlerts] =
      await Promise.all([
        analyticsService.getTenantKPIs(tenantId),
        prisma.patient.count({ where: { tenantId, deletedAt: null } }),
        prisma.sale.aggregate({
          where: { tenantId, soldAt: { gte: startOfDay } },
          _sum: { totalAmount: true },
        }),
        prisma.sale.aggregate({
          where: { tenantId, soldAt: { gte: startOfMonth } },
          _sum: { totalAmount: true },
        }),
        prisma.stockAlert.count({ where: { tenantId, isResolved: false } }),
        prisma.expiryAlert.count({ where: { tenantId, resolved: false } }),
      ]);

    const result = {
      totalMedicines: kpis.totalSku,
      totalSuppliers: kpis.supplierCount,
      totalCustomers,
      totalSales: todaySales._sum.totalAmount || 0,
      totalRevenue: monthSales._sum.totalAmount || 0,
      activeAlerts: activeStockAlerts + activeExpiryAlerts,
      expiringCount: kpis.expiring30Days,
      lowStockCount: kpis.lowStock,
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getSalesSummary(tenantId) {
    const cacheKey = `dashboard:sales-summary:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - now.getDay() * 86400000);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todaySales, weekSales, monthSales] = await Promise.all([
      prisma.sale.aggregate({
        where: { tenantId, soldAt: { gte: startOfToday } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { tenantId, soldAt: { gte: startOfWeek } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      prisma.sale.aggregate({
        where: { tenantId, soldAt: { gte: startOfMonth } },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
    ]);

    const paymentMethodBreakdown = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: {
        tenantId,
        soldAt: { gte: startOfMonth },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const topSelling = await prisma.saleItem.groupBy({
      by: ['medicineId'],
      where: {
        sale: { tenantId, soldAt: { gte: startOfMonth } },
      },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const medicineIds = topSelling.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await prisma.medicine.findMany({
          where: { id: { in: medicineIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];
    const medicineMap = {};
    for (const m of medicines) medicineMap[m.id] = m.name;

    const result = {
      todaySales: { total: todaySales._sum.totalAmount || 0, count: todaySales._count.id || 0 },
      weekSales: { total: weekSales._sum.totalAmount || 0, count: weekSales._count.id || 0 },
      monthSales: { total: monthSales._sum.totalAmount || 0, count: monthSales._count.id || 0 },
      paymentMethodBreakdown: paymentMethodBreakdown.map((p) => ({
        method: p.paymentMethod,
        total: p._sum.totalAmount || 0,
        count: p._count.id || 0,
      })),
      topSellingMedicines: topSelling.map((s) => ({
        medicineId: s.medicineId,
        name: medicineMap[s.medicineId] || 'Unknown',
        quantitySold: s._sum.quantity || 0,
        revenue: s._sum.totalAmount || 0,
      })),
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getInventoryHealth(tenantId) {
    const cacheKey = `dashboard:inventory-health:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const kpis = await analyticsService.getTenantKPIs(tenantId);

    const result = {
      totalStock: 0,
      lowStockItems: kpis.lowStock,
      outOfStockItems: 0,
      expiringItems: kpis.expiring30Days,
      expiredItems: 0,
      stockValue: kpis.inventoryValue,
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getAlerts(tenantId) {
    const cacheKey = `dashboard:alerts:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiredBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId, deletedAt: null },
        expiryDate: { lt: now },
        quantity: { gt: 0 },
        deletedAt: null,
      },
      select: {
        id: true,
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        purchasePrice: true,
        medicine: { select: { id: true, name: true } },
      },
    });

    const expiringBatches = await prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId, deletedAt: null },
        expiryDate: { gte: now, lte: thirtyDaysLater },
        quantity: { gt: 0 },
        deletedAt: null,
      },
      select: {
        id: true,
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        purchasePrice: true,
        medicine: { select: { id: true, name: true } },
      },
    });

    const lowStockAlerts = await prisma.stockAlert.findMany({
      where: { tenantId, isResolved: false, type: { in: ['LOW_STOCK', 'OUT_OF_STOCK'] } },
      include: { medicine: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const critical = expiredBatches.map((b) => ({
      type: 'critical',
      message: `${b.medicine.name} (Batch: ${b.batchNumber}) expired on ${b.expiryDate.toISOString().split('T')[0]}`,
      quantity: b.quantity,
      lossValue: b.quantity * b.purchasePrice,
      batchId: b.id,
      medicineId: b.medicine.id,
      medicineName: b.medicine.name,
    }));

    const warnings = expiringBatches.map((b) => ({
      type: 'warning',
      message: `${b.medicine.name} (Batch: ${b.batchNumber}) expires in ${Math.ceil((b.expiryDate - now) / (1000 * 60 * 60 * 24))} days`,
      quantity: b.quantity,
      expiryDate: b.expiryDate,
      batchId: b.id,
      medicineId: b.medicine.id,
      medicineName: b.medicine.name,
    }));

    const info = lowStockAlerts.map((a) => ({
      type: 'info',
      message: a.message,
      alertId: a.id,
      medicineId: a.medicine.id,
      medicineName: a.medicine.name,
    }));

    const result = { critical, warnings, info };
    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }
}

export default new DashboardService();
