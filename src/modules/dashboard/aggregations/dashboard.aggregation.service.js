import prisma from '../../../config/prisma.js';
import dashboardAggregationRepository from '../repositories/dashboard.aggregation.repository.js';
import dashboardCacheManager from '../aggregations/dashboard.cache-manager.js';
import logger from '../../../shared/utils/logger.js';

const ROLE_DASHBOARD_CONFIG = {
  OWNER: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
  ADMIN: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
  PHARMACIST: ['inventory_health', 'alerts'],
  CASHIER: ['overview', 'sales_summary'],
  MANAGER: ['overview', 'sales_summary', 'inventory_health', 'alerts'],
};

class DashboardAggregationService {
  async getExecutiveSummary(tenantId, userRole = 'OWNER') {
    if (!tenantId) {
      throw new Error('Tenant missing');
    }

    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions for overview');
      error.statusCode = 403;
      throw error;
    }

    const cached = await dashboardCacheManager.get(tenantId, 'executive_summary');
    if (cached) return cached;

    const results = await Promise.allSettled([
      this.getFinancialSummary(tenantId, userRole),
      this.getLowStockSummary(tenantId, userRole),
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

    const financials = safeValue(results[0], {
      totalSuppliers: 0,
      todayRevenue: 0,
      todayInvoices: 0,
      monthRevenue: 0,
      monthInvoices: 0,
      pendingOrders: 0,
    });
    const inventory = safeValue(results[1], {
      critical: 0,
      low: 0,
      outOfStock: 0,
      totalSku: 0,
      lowStock: 0,
      expiring30d: 0,
      inventoryValue: 0,
      topRisks: [],
    });
    const pendingOrders = safeValue(results[2], {
      pendingPOs: 0,
      delayedDeliveries: 0,
      awaitingApproval: 0,
    });
    const today = safeValue(results[3], { invoices: 0, patients: 0, prescriptions: 0, revenue: 0 });
    const activeAlerts = safeValue(results[4], 0);

    const warnings = results
      .map((r, i) => (r.status === 'rejected' ? `metric_${i}_failed` : null))
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
  }

  async getLowStockSummary(tenantId, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'inventory_health')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const cached = await dashboardCacheManager.get(tenantId, 'low_stock_summary');
    if (cached) return cached;

    const metrics = await dashboardAggregationRepository.getStockHealthMetrics(tenantId);
    const topRisks = await dashboardAggregationRepository.getTopLowStockMedicines(tenantId, 5);

    const [valueResult] = await prisma.$queryRaw`
      SELECT SUM("quantity" * COALESCE("mrp", 0)) as "totalValue"
      FROM "InventoryBatch" as "ib"
      INNER JOIN "Medicine" as "m" ON "ib"."medicineId" = "m"."id"
      WHERE "m"."tenantId" = ${tenantId}
        AND "ib"."quantity" > 0
        AND "ib"."deletedAt" IS NULL
        AND "m"."deletedAt" IS NULL
    `;
    const inventoryValue = Number(valueResult?.totalValue || 0);

    const data = {
      critical: metrics.outOfStockCount,
      low: metrics.lowStockCount,
      outOfStock: metrics.outOfStockCount,
      totalSku: await prisma.medicine.count({
        where: { tenantId, deletedAt: null, isActive: true },
      }),
      lowStock: metrics.lowStockCount,
      expiring30d: metrics.expiringCount,
      inventoryValue: inventoryValue,
      topRisks: topRisks.map((m) => ({
        medicine: m.name,
        totalStock: m.inventoryBatches.reduce((sum, b) => sum + b.quantity, 0),
      })),
      computedAt: new Date().toISOString(),
    };

    await dashboardCacheManager.set(tenantId, 'low_stock_summary', data);
    return data;
  }

  async getFinancialSummary(tenantId, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const [todaySales, monthSales, pendingPOs, totalSuppliers] = await Promise.all([
      dashboardAggregationRepository.getTodaySales(tenantId),
      dashboardAggregationRepository.getMonthSales(tenantId),
      dashboardAggregationRepository.getPendingPurchaseOrders(tenantId),
      prisma.supplier.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      todayRevenue: Number(todaySales._sum.totalAmount || 0),
      todayInvoices: todaySales._count.id || 0,
      monthRevenue: Number(monthSales._sum.totalAmount || 0),
      monthInvoices: monthSales._count.id || 0,
      pendingOrders: pendingPOs,
      totalSuppliers: totalSuppliers,
      computedAt: new Date().toISOString(),
    };
  }

  async getSalesPerformance(tenantId, branchId = 'today') {
    const [paymentBreakdown, topSelling] = await Promise.all([
      dashboardAggregationRepository.getPaymentMethodBreakdown(tenantId, branchId),
      dashboardAggregationRepository.getTopSellingMedicines(tenantId, branchId, 10),
    ]);

    const medicineIds = topSelling.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await prisma.medicine.findMany({
          where: { id: { in: medicineIds }, tenantId },
          select: { id: true, name: true },
        })
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
    const metrics = await dashboardAggregationRepository.getStockHealthMetrics(tenantId);
    return {
      lowStockCount: metrics.lowStockCount,
      outOfStockCount: metrics.outOfStockCount,
      expiringSoonCount: metrics.expiringCount,
      expiredCount: metrics.expiredCount,
      totalStock: metrics.totalStock,
      computedAt: new Date().toISOString(),
    };
  }

  async getPatientAnalytics() {
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
      // Just test a get/set or simple ping if available. We will rely on our cache manager.
      await dashboardCacheManager.client.ping();
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
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const cached = await dashboardCacheManager.get(tenantId, 'pending_orders');
    if (cached) return cached;

    const pendingPOs = await dashboardAggregationRepository.getPendingPurchaseOrders(tenantId);

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
    if (!this._hasAccess(userRole, 'overview')) {
      const error = new Error('Insufficient permissions');
      error.statusCode = 403;
      throw error;
    }
    const cached = await dashboardCacheManager.get(tenantId, 'today_summary');
    if (cached) return cached;

    const [todaySales, totalPatients] = await Promise.all([
      dashboardAggregationRepository.getTodaySales(tenantId),
      prisma.patient.count({ where: { tenantId, deletedAt: null } }),
    ]);

    const data = {
      invoices: todaySales._count.id || 0,
      patients: totalPatients,
      prescriptions: 0,
      revenue: Number(todaySales._sum.totalAmount || 0),
      computedAt: new Date().toISOString(),
    };

    await dashboardCacheManager.set(tenantId, 'today_summary', data);
    return data;
  }

  async getOverview(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'overview')) {
      throw new Error('Insufficient permissions for overview');
    }

    const cached = await dashboardCacheManager.get(tenantId, 'overview', branchId);
    if (cached) return cached;

    const snapshot = await dashboardAggregationRepository.getValidSnapshot(
      tenantId,
      'OVERVIEW',
      branchId,
    );
    if (snapshot) {
      await dashboardCacheManager.set(tenantId, 'overview', snapshot.snapshotData, branchId);
      return snapshot.snapshotData;
    }

    const data = await this._computeOverview(tenantId, branchId);

    await Promise.all([
      dashboardCacheManager.set(tenantId, 'overview', data, branchId),
      dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'OVERVIEW',
        data,
        branchId,
        dashboardCacheManager.getTTL('overview'),
      ),
    ]);

    return data;
  }

  async getSalesSummary(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'sales_summary')) {
      throw new Error('Insufficient permissions for sales summary');
    }

    const cached = await dashboardCacheManager.get(tenantId, 'sales_summary', branchId);
    if (cached) return cached;

    const snapshot = await dashboardAggregationRepository.getValidSnapshot(
      tenantId,
      'SALES_SUMMARY',
      branchId,
    );
    if (snapshot) {
      await dashboardCacheManager.set(tenantId, 'sales_summary', snapshot.snapshotData, branchId);
      return snapshot.snapshotData;
    }

    const data = await this._computeSalesSummary(tenantId, branchId);

    await Promise.all([
      dashboardCacheManager.set(tenantId, 'sales_summary', data, branchId),
      dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'SALES_SUMMARY',
        data,
        branchId,
        dashboardCacheManager.getTTL('sales_summary'),
      ),
    ]);

    return data;
  }

  async getInventoryHealth(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'inventory_health')) {
      throw new Error('Insufficient permissions for inventory health');
    }

    const cached = await dashboardCacheManager.get(tenantId, 'inventory_health', branchId);
    if (cached) return cached;

    const snapshot = await dashboardAggregationRepository.getValidSnapshot(
      tenantId,
      'INVENTORY_HEALTH',
      branchId,
    );
    if (snapshot) {
      await dashboardCacheManager.set(
        tenantId,
        'inventory_health',
        snapshot.snapshotData,
        branchId,
      );
      return snapshot.snapshotData;
    }

    const data = await this._computeInventoryHealth(tenantId, branchId);

    await Promise.all([
      dashboardCacheManager.set(tenantId, 'inventory_health', data, branchId),
      dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'INVENTORY_HEALTH',
        data,
        branchId,
        dashboardCacheManager.getTTL('inventory_health'),
      ),
    ]);

    return data;
  }

  async getAlerts(tenantId, branchId = null, userRole = 'OWNER') {
    if (!this._hasAccess(userRole, 'alerts')) {
      throw new Error('Insufficient permissions for alerts');
    }

    const cached = await dashboardCacheManager.get(tenantId, 'alerts', branchId);
    if (cached) return cached;

    const snapshot = await dashboardAggregationRepository.getValidSnapshot(
      tenantId,
      'ALERTS',
      branchId,
    );
    if (snapshot) {
      await dashboardCacheManager.set(tenantId, 'alerts', snapshot.snapshotData, branchId);
      return snapshot.snapshotData;
    }

    const data = await this._computeAlerts(tenantId, branchId);

    await Promise.all([
      dashboardCacheManager.set(tenantId, 'alerts', data, branchId),
      dashboardAggregationRepository.saveSnapshot(
        tenantId,
        'ALERTS',
        data,
        branchId,
        dashboardCacheManager.getTTL('alerts'),
      ),
    ]);

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
    const [todaySales, monthSales, lowStockCount, expiringCount, pendingPOs] = await Promise.all([
      dashboardAggregationRepository.getTodaySales(tenantId, branchId),
      dashboardAggregationRepository.getMonthSales(tenantId, branchId),
      dashboardAggregationRepository.getLowStockCount(tenantId, branchId),
      dashboardAggregationRepository.getExpiringMedicinesCount(tenantId, branchId),
      dashboardAggregationRepository.getPendingPurchaseOrders(tenantId, branchId),
    ]);

    const topSelling = await dashboardAggregationRepository.getTopSellingMedicines(
      tenantId,
      branchId,
      1,
    );

    let topSellingMedicine = null;
    if (topSelling.length > 0) {
      const medicine = await prisma.medicine.findFirst({
        where: { id: topSelling[0].medicineId, tenantId },
        select: { name: true },
      });
      topSellingMedicine = medicine?.name || 'Unknown';
    }

    return {
      todayRevenue: Number(todaySales._sum.totalAmount || 0),
      todayInvoices: todaySales._count.id || 0,
      monthRevenue: Number(monthSales._sum.totalAmount || 0),
      lowStockCount,
      expiringMedicines: expiringCount,
      pendingPurchaseOrders: pendingPOs,
      topSellingMedicine,
      computedAt: new Date().toISOString(),
    };
  }

  async _computeSalesSummary(tenantId, branchId) {
    const dailySummary = await dashboardAggregationRepository.getDailySalesSummary(
      tenantId,
      branchId,
    );

    if (dailySummary) {
      const paymentBreakdown = await dashboardAggregationRepository.getPaymentMethodBreakdown(
        tenantId,
        branchId,
      );

      const topSelling = await dashboardAggregationRepository.getTopSellingMedicines(
        tenantId,
        branchId,
      );

      const medicineIds = topSelling.map((s) => s.medicineId);
      const medicines = medicineIds.length
        ? await prisma.medicine.findMany({
            where: { id: { in: medicineIds }, tenantId },
            select: { id: true, name: true },
          })
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

    const [todaySales, monthSales] = await Promise.all([
      dashboardAggregationRepository.getTodaySales(tenantId, branchId),
      dashboardAggregationRepository.getMonthSales(tenantId, branchId),
    ]);

    const paymentBreakdown = await dashboardAggregationRepository.getPaymentMethodBreakdown(
      tenantId,
      branchId,
    );

    const topSelling = await dashboardAggregationRepository.getTopSellingMedicines(
      tenantId,
      branchId,
    );

    const medicineIds = topSelling.map((s) => s.medicineId);
    const medicines = medicineIds.length
      ? await prisma.medicine.findMany({
          where: { id: { in: medicineIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];
    const medicineMap = {};
    for (const m of medicines) medicineMap[m.id] = m.name;

    return {
      todaySales: {
        total: Number(todaySales._sum.totalAmount || 0),
        count: todaySales._count.id || 0,
      },
      monthSales: {
        total: Number(monthSales._sum.totalAmount || 0),
        count: monthSales._count.id || 0,
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
    const metrics = await dashboardAggregationRepository.getStockHealthMetrics(tenantId, branchId);

    const totalItems = metrics.totalBatches;
    const healthyItems =
      totalItems - metrics.expiredCount - metrics.expiringCount - metrics.outOfStockCount;
    const healthyStockPercentage =
      totalItems > 0 ? Math.round((healthyItems / totalItems) * 100) : 100;

    return {
      healthyStockPercentage,
      lowStockCount: metrics.lowStockCount,
      outOfStockCount: metrics.outOfStockCount,
      expiringSoonCount: metrics.expiringCount,
      expiredCount: metrics.expiredCount,
      totalStock: metrics.totalStock,
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
