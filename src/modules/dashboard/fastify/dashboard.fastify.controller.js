import prisma from '../../../config/prisma.js';
import dashboardAggregationService from '../aggregations/dashboard.aggregation.service.js';
import expiryAnalyticsService from '../../inventory/service/expiry-analytics.service.js';
import unifiedInventorySummaryService from '../../inventory/service/unified-inventory-summary.service.js';

class DashboardFastifyController {
  async getDashboardSummary(request, reply) {
    try {
      if (!request.user?.tenantId) {
        throw new Error('Tenant missing');
      }
      const tenantId = request.user.tenantId;
      const branchId = request.branchId || null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [
        todaySalesAggRes,
        monthlySalesAggRes,
        inventorySummaryRes,
        invoiceCountRes,
        expiryMetricsRes,
      ] = await Promise.allSettled([
        prisma.sale.aggregate({
          where: { tenantId, ...(branchId && { branchId }), soldAt: { gte: today } },
          _sum: { totalAmount: true },
        }),
        prisma.sale.aggregate({
          where: { tenantId, ...(branchId && { branchId }), soldAt: { gte: startOfMonth } },
          _sum: { totalAmount: true },
        }),
        unifiedInventorySummaryService.getUnifiedSummary(tenantId, branchId),
        prisma.invoice.count({
          where: { tenantId, ...(branchId && { branchId }), createdAt: { gte: today } },
        }),
        expiryAnalyticsService.getExpiryMetrics(tenantId, branchId),
      ]);

      const todaySalesAgg =
        todaySalesAggRes.status === 'fulfilled'
          ? todaySalesAggRes.value
          : { _sum: { totalAmount: 0 } };
      const monthlySalesAgg =
        monthlySalesAggRes.status === 'fulfilled'
          ? monthlySalesAggRes.value
          : { _sum: { totalAmount: 0 } };
      const inventorySummary =
        inventorySummaryRes.status === 'fulfilled' ? inventorySummaryRes.value : { totalStock: 0 };
      const invoiceCount = invoiceCountRes.status === 'fulfilled' ? invoiceCountRes.value : 0;
      const expiryMetrics =
        expiryMetricsRes.status === 'fulfilled'
          ? expiryMetricsRes.value
          : {
              expiredProducts: 0,
              expiring30Products: 0,
              expiredUnits: 0,
              expiredValue: 0,
            };

      return reply.send({
        success: true,
        data: {
          todaySales: todaySalesAgg?._sum?.totalAmount || 0,
          monthlySales: monthlySalesAgg?._sum?.totalAmount || 0,
          stockValue: inventorySummary.totalStock,
          totalInvoices: invoiceCount,
          expiredMedicines: expiryMetrics.expiredProducts,
          expiring30Medicines: expiryMetrics.expiring30Products,
          expiring7Medicines: expiryMetrics.expiring7Products,
          expiredUnits: expiryMetrics.expiredUnits,
          expiredValue: expiryMetrics.expiredValue,
        },
      });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-summary',
          message: error.message,
          stack: error.stack,
          tenantId: request.user?.tenantId,
        },
        'Dashboard summary failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getExecutiveSummary(request, reply) {
    try {
      if (!request.user?.tenantId) {
        throw new Error('Tenant missing');
      }
      const tenantId = request.user.tenantId;
      const userRole = request.user?.role || 'OWNER';
      const data = await dashboardAggregationService.getExecutiveSummary(tenantId, userRole);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-overview',
          message: error.message,
          stack: error.stack,
          tenantId: request.user?.tenantId,
          userRole: request.user?.role,
        },
        'Dashboard overview failed',
      );
      return reply.code(error.statusCode || 500).send({ success: false, message: error.message });
    }
  }

  async getInventoryInsights(request, reply) {
    try {
      if (!request.user?.tenantId) {
        throw new Error('Tenant missing');
      }
      const tenantId = request.user.tenantId;
      const { branchId } = request.query;
      const data = await dashboardAggregationService.getInventoryInsights(tenantId, branchId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-inventory-insights',
          message: error.message,
          stack: error.stack,
          tenantId: request.user?.tenantId,
        },
        'Dashboard inventory insights failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSalesPerformance(request, reply) {
    try {
      if (!request.user?.tenantId) {
        throw new Error('Tenant missing');
      }
      const tenantId = request.user.tenantId;
      const { branchId, timeframe } = request.query;
      const data = await dashboardAggregationService.getSalesPerformance(
        tenantId,
        branchId,
        timeframe,
      );
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-sales-performance',
          message: error.message,
          stack: error.stack,
          tenantId: request.user?.tenantId,
        },
        'Dashboard sales performance failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getPatientAnalytics(request, reply) {
    try {
      if (!request.user?.tenantId) {
        throw new Error('Tenant missing');
      }
      const tenantId = request.user.tenantId;
      const data = await dashboardAggregationService.getPatientAnalytics(tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-patient-analytics',
          message: error.message,
          stack: error.stack,
          tenantId: request.user?.tenantId,
        },
        'Dashboard patient analytics failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSystemHealth(request, reply) {
    try {
      const data = await dashboardAggregationService.getSystemHealth();
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          endpoint: 'dashboard-system-health',
          message: error.message,
          stack: error.stack,
        },
        'Dashboard system health failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new DashboardFastifyController();
