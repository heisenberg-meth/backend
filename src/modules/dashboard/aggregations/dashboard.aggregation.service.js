import prisma from '../../../config/prisma.js';
import dashboardAggregationRepository from '../repositories/dashboard.aggregation.repository.js';
import dashboardCacheManager from '../aggregations/dashboard.cache-manager.js';
import logger from '../../../shared/utils/logger.js';
import unifiedInventorySummaryService from '../../inventory/service/unified-inventory-summary.service.js';
import analyticsRepository from '../../analytics/repository/analytics.repository.js';

const safeMetric = async (fn, fallback = 0) => {
  try {
    return await fn();
  } catch (error) {
    logger.error({ err: error }, 'Dashboard metric query failed');
    return fallback;
  }
};

const ROLE_DASHBOARD_CONFIG = {
  OWNER: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
  ADMIN: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
  PHARMACIST: ['inventory_health', 'alerts'],
  CASHIER: ['overview', 'sales_summary'],
  MANAGER: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
};

class DashboardAggregationService {
  async getExecutiveSummary(tenantId, userRole = 'OWNER') {
    try {
      if (!tenantId) {
        throw new Error('Tenant missing');
      }

      if (!this._hasAccess(userRole, 'overview')) {
        const error = new Error('Insufficient permissions for overview');
        error.statusCode = 403;
        throw error;
      }

      const results = await Promise.allSettled([
        this.getLowStockSummary(tenantId, userRole),
        this.getFinancialSummary(tenantId, userRole),
        this.getPendingOrders(tenantId, userRole),
        this.getTodaySummary(tenantId, userRole),
        prisma.stockAlert.count({ where: { tenantId, isResolved: false } }),
      ]);

      const safeValue = (result, fallback) => {
        if (result.status === 'fulfilled') return result.value;
        logger.error(
          { err: result.reason, endpoint: 'dashboard-overview' },
          'Dashboard metric failed',
        );
        return fallback;
      };

      const inventory = safeValue(results[0], {
        critical: 0,
        low: 0,
        outOfStock: 0,
        totalSku: 0,
        lowStock: 0,
        expiring30d: 0,
        inventoryValue: 0,
        topRisks: [],
      });
      const financials = safeValue(results[1], {
        totalSuppliers: 0,
        todayRevenue: 0,
        todayInvoices: 0,
        monthRevenue: 0,
        monthInvoices: 0,
        pendingOrders: 0,
      });
      const pendingOrders = safeValue(results[2], {
        pendingPOs: 0,
        delayedDeliveries: 0,
        awaitingApproval: 0,
      });
      const today = safeValue(results[3], {
        invoices: 0,
        patients: 0,
        prescriptions: 0,
        revenue: 0,
      });
      const activeAlerts = safeValue(results[4], 0);

      const metricNames = [
        'financials',
        'inventory',
        'pending_orders',
        'today_summary',
        'active_alerts',
      ];
      const warnings = results
        .map((r, i) => (r.status === 'rejected' ? `${metricNames[i]}_unavailable` : null))
        .filter(Boolean);

      const data = {
        financials,
        inventory,
        pendingOrders,
        today,
        totalSuppliers: financials.totalSuppliers || 0,
        totalCustomers: today.patients || 0,
        activeAlerts: activeAlerts || 0,
        suppliers: {
          total: financials.totalSuppliers || 0,
        },
        patients: {
          total: today.patients || 0,
        },
        alerts: {
          active: activeAlerts || 0,
        },
        warnings,
        generatedAt: new Date().toISOString(),
      };

      await dashboardCacheManager.set(tenantId, 'executive_summary', data);
      return data;
    } catch (error) {
      logger.error({
        endpoint: 'dashboard-overview',
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  async getLowStockSummary(tenantId, userRole = 'OWNER') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    if (!this._hasAccess(userRole, 'inventory_health')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }

    const [unifiedMetrics, topRisks] = await Promise.all([
      unifiedInventorySummaryService.getUnifiedSummary(tenantId, null, true),
      dashboardAggregationRepository.getTopLowStockMedicines(tenantId, 5),
    ]);

    const data = {
      critical: unifiedMetrics.outOfStockCount,
      low: unifiedMetrics.lowStockCount,
      outOfStock: unifiedMetrics.outOfStockCount,
      totalSku: unifiedMetrics.totalMedicines,
      lowStock: unifiedMetrics.lowStockCount,
      expiring30d: unifiedMetrics.expiringBatches,
      inventoryValue: unifiedMetrics.inventoryValue,
      totalStock: unifiedMetrics.totalStock,
      expiredCount: unifiedMetrics.expiredBatches,
      expiringCount: unifiedMetrics.expiringBatches,
      inStockCount: unifiedMetrics.inStockCount,
      topRisks: topRisks.map((m) => ({
        medicine: m.name,
        totalStock: m.inventoryBatches
          ? m.inventoryBatches.reduce((sum, b) => sum + b.quantity, 0)
          : 0,
      })),
      computedAt: new Date().toISOString(),
    };

    await dashboardCacheManager.set(tenantId, 'low_stock_summary', data);
    return data;
  }

  async getFinancialSummary(tenantId, userRole = 'OWNER') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const results = await Promise.allSettled([
      dashboardAggregationRepository.getTodaySales(tenantId),
      dashboardAggregationRepository.getMonthSales(tenantId),
      dashboardAggregationRepository.getPendingPurchaseOrders(tenantId),
      analyticsRepository.getSupplierCount(tenantId),
    ]);

    const todaySales =
      results[0].status === 'fulfilled'
        ? results[0].value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const monthSales =
      results[1].status === 'fulfilled'
        ? results[1].value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const pendingPOs = results[2].status === 'fulfilled' ? results[2].value : 0;
    const totalSuppliers = results[3].status === 'fulfilled' ? results[3].value : 0;

    return {
      todayRevenue: Number(todaySales?._sum?.totalAmount || 0),
      todayInvoices: todaySales?._count?.id || 0,
      monthRevenue: Number(monthSales?._sum?.totalAmount || 0),
      monthInvoices: monthSales?._count?.id || 0,
      pendingOrders: pendingPOs,
      totalSuppliers: totalSuppliers,
      computedAt: new Date().toISOString(),
    };
  }

  async getSalesPerformance(tenantId, branchId = 'today') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    const [paymentBreakdownRes, topSellingRes] = await Promise.allSettled([
      dashboardAggregationRepository.getPaymentMethodBreakdown(tenantId, branchId),
      dashboardAggregationRepository.getTopSellingMedicines(tenantId, branchId, 10),
    ]);

    const paymentBreakdown =
      paymentBreakdownRes.status === 'fulfilled' ? paymentBreakdownRes.value : [];
    const topSelling = topSellingRes.status === 'fulfilled' ? topSellingRes.value : [];

    const medicineIds = topSelling.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await safeMetric(
          () =>
            prisma.medicine.findMany({
              where: { id: { in: medicineIds }, tenantId },
              select: { id: true, name: true },
            }),
          [],
        )
      : [];
    const medicineMap = {};
    for (const m of medicines) medicineMap[m.id] = m.name;

    return {
      paymentBreakdown: paymentBreakdown.map((p) => ({
        method: p.paymentMethod,
        total: p.totalAmount,
        count: p.totalCount,
      })),
      topSelling: topSelling.map((s) => ({
        medicineId: s.medicineId,
        name: medicineMap[s.medicineId] || 'Unknown',
        quantitySold: s._sum.quantity || 0,
        revenue: s._sum.totalAmount || 0,
      })),
      computedAt: new Date().toISOString(),
    };
  }

  async getInventoryInsights(tenantId = null) {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    const unifiedMetrics = await unifiedInventorySummaryService.getUnifiedSummary(tenantId, null, true);
    return {
      lowStockCount: unifiedMetrics.lowStockCount,
      outOfStockCount: unifiedMetrics.outOfStockCount,
      expiringSoonCount: unifiedMetrics.expiringBatches,
      expiredCount: unifiedMetrics.expiredBatches,
      totalStock: unifiedMetrics.totalStock,
      inStockCount: unifiedMetrics.inStockCount,
      computedAt: new Date().toISOString(),
    };
  }

  async getPatientAnalytics(tenantId) {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    return {
      totalPatients: 0,
      newPatients: 0,
      repeatRate: 0,
      computedAt: new Date().toISOString(),
    };
  }

  async getSystemHealth() {
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = 'unhealthy';
      logger.error({ err: error }, 'Database health check failed');
    }

    try {
      const redisClient = (await import('../../../config/redis.js')).default;
      await redisClient.ping();
    } catch (error) {
      redisStatus = 'unhealthy';
      logger.error({ err: error }, 'Redis health check failed');
    }

    return {
      database: dbStatus,
      redis: redisStatus,
      server: 'healthy',
      uptime: process.uptime(),
      computedAt: new Date().toISOString(),
    };
  }

  async getPendingOrders(tenantId, userRole = 'OWNER') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const cached = await dashboardCacheManager.get(tenantId, 'pending_orders');
    if (cached) return cached;

    const pendingPOs = await safeMetric(
      () => dashboardAggregationRepository.getPendingPurchaseOrders(tenantId),
      0,
    );

    const data = {
      pendingPOs: pendingPOs,
      delayedDeliveries: 0,
      awaitingApproval: 0,
      computedAt: new Date().toISOString(),
    };

    await dashboardCacheManager.set(tenantId, 'pending_orders', data);
    return data;
  }

  async getTodaySummary(tenantId, userRole = 'OWNER') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const cached = await dashboardCacheManager.get(tenantId, 'today_summary');
    if (cached) return cached;

    const results = await Promise.allSettled([
      dashboardAggregationRepository.getTodaySales(tenantId),
      prisma.patient.count({ where: { tenantId, deletedAt: null } }),
    ]);

    const todaySales =
      results[0].status === 'fulfilled'
        ? results[0].value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const totalPatients = results[1].status === 'fulfilled' ? results[1].value : 0;

    const data = {
      invoices: todaySales?._count?.id || 0,
      patients: totalPatients,
      prescriptions: 0,
      revenue: Number(todaySales?._sum?.totalAmount || 0),
      computedAt: new Date().toISOString(),
    };

    await dashboardCacheManager.set(tenantId, 'today_summary', data);
    return data;
  }

  async getOverview(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'overview')) {
      throw new Error('Insufficient permissions for overview');
    }

    const data = await this._computeOverview(tenantId, branchId);
    return data;
  }

  async getSalesSummary(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'sales_summary')) {
      throw new Error('Insufficient permissions for sales summary');
    }

    const data = await this._computeSalesSummary(tenantId, branchId);
    return data;
  }

  async getInventoryHealth(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'inventory_health')) {
      throw new Error('Insufficient permissions for inventory health');
    }

    const data = await this._computeInventoryHealth(tenantId, branchId);
    return data;
  }

  async getAlerts(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'alerts')) {
      throw new Error('Insufficient permissions for alerts');
    }

    const data = await this._computeAlerts(tenantId, branchId);
    return data;
  }

  async refreshAllSnapshots(tenantId, branchId = null) {
    logger.info({ tenantId, branchId }, 'Refreshing all dashboard snapshots');

    await Promise.allSettled([
      this._computeAndCacheOverview(tenantId, branchId),
      this._computeAndCacheSalesSummary(tenantId, branchId),
      this._computeAndCacheInventoryHealth(tenantId, branchId),
      this._computeAndCacheAlerts(tenantId, branchId),
    ]);

    await dashboardAggregationRepository.invalidateSnapshots(tenantId, branchId);
    await dashboardCacheManager.invalidate(tenantId, null, branchId);
  }

  async _computeAndCacheOverview(tenantId, branchId) {
    try {
      const data = await this._computeOverview(tenantId, branchId);
      await dashboardCacheManager.set(tenantId, 'overview', data, branchId);
      await dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'OVERVIEW',
        data,
        branchId,
        dashboardCacheManager.getTTL('overview'),
      );
    } catch (err) {
      logger.error({ err, tenantId, branchId }, 'Failed to compute overview snapshot');
    }
  }

  async _computeAndCacheSalesSummary(tenantId, branchId) {
    try {
      const data = await this._computeSalesSummary(tenantId, branchId);
      await dashboardCacheManager.set(tenantId, 'sales_summary', data, branchId);
      await dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'SALES_SUMMARY',
        data,
        branchId,
        dashboardCacheManager.getTTL('sales_summary'),
      );
    } catch (err) {
      logger.error({ err, tenantId, branchId }, 'Failed to compute sales summary snapshot');
    }
  }

  async _computeAndCacheInventoryHealth(tenantId, branchId) {
    try {
      const data = await this._computeInventoryHealth(tenantId, branchId);
      await dashboardCacheManager.set(tenantId, 'inventory_health', data, branchId);
      await dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'INVENTORY_HEALTH',
        data,
        branchId,
        dashboardCacheManager.getTTL('inventory_health'),
      );
    } catch (err) {
      logger.error({ err, tenantId, branchId }, 'Failed to compute inventory health snapshot');
    }
  }

  async _computeAndCacheAlerts(tenantId, branchId) {
    try {
      const data = await this._computeAlerts(tenantId, branchId);
      await dashboardCacheManager.set(tenantId, 'alerts', data, branchId);
      await dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'ALERTS',
        data,
        branchId,
        dashboardCacheManager.getTTL('alerts'),
      );
    } catch (err) {
      logger.error({ err, tenantId, branchId }, 'Failed to compute alerts snapshot');
    }
  }

  async _computeOverview(tenantId, branchId) {
    const results = await Promise.allSettled([
      dashboardAggregationRepository.getTodaySales(tenantId, branchId),
      dashboardAggregationRepository.getMonthSales(tenantId, branchId),
      unifiedInventorySummaryService.getUnifiedSummary(tenantId, branchId, true),
      dashboardAggregationRepository.getPendingPurchaseOrders(tenantId, branchId),
    ]);

    const todaySales =
      results[0].status === 'fulfilled'
        ? results[0].value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const monthSales =
      results[1].status === 'fulfilled' ? results[1].value : { _sum: { totalAmount: 0 } };
    const unified = results[2].status === 'fulfilled' ? results[2].value : { lowStockCount: 0, expiringBatches: 0 };
    const lowStockCount = unified.lowStockCount;
    const expiringCount = unified.expiringBatches;
    const pendingPOs = results[3].status === 'fulfilled' ? results[3].value : 0;

    const topSelling = await safeMetric(
      () => dashboardAggregationRepository.getTopSellingMedicines(tenantId, branchId, 1),
      [],
    );

    let topSellingMedicine = null;
    if (topSelling && topSelling.length > 0) {
      const medicine = await safeMetric(
        () =>
          prisma.medicine.findFirst({
            where: { id: topSelling[0].medicineId, tenantId },
            select: { name: true },
          }),
        null,
      );
      topSellingMedicine = medicine?.name || 'Unknown';
    }

    return {
      todayRevenue: Number(todaySales?._sum?.totalAmount || 0),
      todayInvoices: todaySales?._count?.id || 0,
      monthRevenue: Number(monthSales?._sum?.totalAmount || 0),
      lowStockCount,
      expiringMedicines: expiringCount,
      pendingPurchaseOrders: pendingPOs,
      topSellingMedicine,
      computedAt: new Date().toISOString(),
    };
  }

  async _computeSalesSummary(tenantId, branchId) {
    const dailySummary = await safeMetric(
      () => dashboardAggregationRepository.getDailySalesSummary(tenantId, branchId),
      null,
    );

    if (dailySummary) {
      const [paymentBreakdownRes, topSellingRes] = await Promise.allSettled([
        dashboardAggregationRepository.getPaymentMethodBreakdown(tenantId, branchId),
        dashboardAggregationRepository.getTopSellingMedicines(tenantId, branchId),
      ]);

      const paymentBreakdown =
        paymentBreakdownRes.status === 'fulfilled' ? paymentBreakdownRes.value : [];
      const topSelling = topSellingRes.status === 'fulfilled' ? topSellingRes.value : [];

      const medicineIds = topSelling.map((s) => s.medicineId);
      const medicines = medicineIds.length
        ? await safeMetric(
            () =>
              prisma.medicine.findMany({
                where: { id: { in: medicineIds }, tenantId },
                select: { id: true, name: true },
              }),
            [],
          )
        : [];
      const medicineMap = {};
      for (const m of medicines) medicineMap[m.id] = m.name;

      return {
        revenue: dailySummary.totalSales,
        invoiceCount: dailySummary.totalInvoices,
        itemsSold: dailySummary.totalItemsSold,
        discount: dailySummary.totalDiscount,
        gst: dailySummary.totalGst,
        paymentMethods: {
          cash: dailySummary.cashSales,
          card: dailySummary.cardSales,
          upi: dailySummary.upiSales,
        },
        paymentMethodBreakdown: paymentBreakdown.map((p) => ({
          method: p.paymentMethod,
          total: p.totalAmount,
          count: p.totalCount,
        })),
        topSellingMedicines: topSelling.map((s) => ({
          medicineId: s.medicineId,
          name: medicineMap[s.medicineId] || 'Unknown',
          quantitySold: s._sum.quantity || 0,
          revenue: s._sum.totalAmount || 0,
        })),
        computedAt: new Date().toISOString(),
      };
    }

    const [todaySalesRes, monthSalesRes, paymentBreakdownRes, topSellingRes] =
      await Promise.allSettled([
        dashboardAggregationRepository.getTodaySales(tenantId, branchId),
        dashboardAggregationRepository.getMonthSales(tenantId, branchId),
        dashboardAggregationRepository.getPaymentMethodBreakdown(tenantId, branchId),
        dashboardAggregationRepository.getTopSellingMedicines(tenantId, branchId),
      ]);

    const todaySales =
      todaySalesRes.status === 'fulfilled'
        ? todaySalesRes.value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const monthSales =
      monthSalesRes.status === 'fulfilled'
        ? monthSalesRes.value
        : { _sum: { totalAmount: 0 }, _count: { id: 0 } };
    const paymentBreakdown =
      paymentBreakdownRes.status === 'fulfilled' ? paymentBreakdownRes.value : [];
    const topSelling = topSellingRes.status === 'fulfilled' ? topSellingRes.value : [];

    const medicineIds = topSelling.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await safeMetric(
          () =>
            prisma.medicine.findMany({
              where: { id: { in: medicineIds }, tenantId },
              select: { id: true, name: true },
            }),
          [],
        )
      : [];
    const medicineMap = {};
    for (const m of medicines) medicineMap[m.id] = m.name;

    return {
      todaySales: {
        total: Number(todaySales?._sum?.totalAmount || 0),
        count: todaySales?._count?.id || 0,
      },
      monthSales: {
        total: Number(monthSales?._sum?.totalAmount || 0),
        count: monthSales?._count?.id || 0,
      },
      paymentMethodBreakdown: paymentBreakdown.map((p) => ({
        method: p.paymentMethod,
        total: p.totalAmount,
        count: p.totalCount,
      })),
      topSellingMedicines: topSelling.map((s) => ({
        medicineId: s.medicineId,
        name: medicineMap[s.medicineId] || 'Unknown',
        quantitySold: s._sum.quantity || 0,
        revenue: s._sum.totalAmount || 0,
      })),
      computedAt: new Date().toISOString(),
    };
  }

  async _computeInventoryHealth(tenantId, branchId) {
    const [unified, metrics] = await Promise.all([
      unifiedInventorySummaryService.getUnifiedSummary(tenantId, branchId, true),
      dashboardAggregationRepository.getStockHealthMetrics(tenantId, branchId),
    ]);

    const totalItems = metrics.totalBatches;
    const healthyItems =
      totalItems - metrics.expiredCount - metrics.expiringCount - metrics.outOfStockCount;
    const healthyStockPercentage =
      totalItems > 0 ? Math.round((healthyItems / totalItems) * 100) : 100;

    return {
      healthyStockPercentage,
      lowStockCount: unified.lowStockCount,
      outOfStockCount: unified.outOfStockCount,
      expiringSoonCount: unified.expiringBatches,
      expiredCount: unified.expiredBatches,
      totalStock: unified.totalStock,
      computedAt: new Date().toISOString(),
    };
  }

  async _computeAlerts(tenantId, branchId) {
    const { alerts, expiredBatches } = await dashboardAggregationRepository.getAlertsBySeverity(
      tenantId,
      branchId,
    );

    const critical = expiredBatches.map((b) => ({
      type: 'CRITICAL',
      severity: 'BLOCKER',
      message: `${b.medicine.name} (Batch: ${b.batchNumber}) expired on ${b.expiryDate.toISOString().split('T')[0]}`,
      quantity: b.quantity,
      lossValue: b.quantity * b.purchasePrice,
      batchId: b.id,
      medicineId: b.medicine.id,
      medicineName: b.medicine.name,
      createdAt: b.expiryDate,
    }));

    const warnings = alerts
      .filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH')
      .map((a) => ({
        type: 'WARNING',
        severity: a.severity,
        message: a.message,
        alertId: a.id,
        medicineId: a.medicine.id,
        medicineName: a.medicine.name,
        alertType: a.type,
        createdAt: a.createdAt,
      }));

    const info = alerts
      .filter((a) => a.severity === 'MEDIUM' || a.severity === 'LOW' || a.severity === 'INFO')
      .map((a) => ({
        type: 'INFO',
        severity: a.severity,
        message: a.message,
        alertId: a.id,
        medicineId: a.medicine.id,
        medicineName: a.medicine.name,
        alertType: a.type,
        createdAt: a.createdAt,
      }));

    return {
      alerts: [...critical, ...warnings, ...info],
      summary: {
        critical: critical.length,
        warnings: warnings.length,
        info: info.length,
        total: critical.length + warnings.length + info.length,
      },
      computedAt: new Date().toISOString(),
    };
  }

  _hasAccess(userRole, section) {
    const allowed = ROLE_DASHBOARD_CONFIG[userRole];
    if (!allowed) return false;
    return allowed.includes(section);
  }
}

export default new DashboardAggregationService();
