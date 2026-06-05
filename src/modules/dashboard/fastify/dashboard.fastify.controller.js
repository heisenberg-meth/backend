import prisma from '../../../config/prisma.js';
import dashboardAggregationService from '../aggregations/dashboard.aggregation.service.js';

class DashboardFastifyController {
  async getDashboardSummary(request, reply) {
    try {
      const { tenantId } = request;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [todaySalesAgg, monthlySalesAgg, stockAgg, invoiceCount, expiredCount] =
        await Promise.all([
          prisma.sale.aggregate({
            where: { tenantId, soldAt: { gte: today } },
            _sum: { totalAmount: true },
          }),
          prisma.sale.aggregate({
            where: { tenantId, soldAt: { gte: startOfMonth } },
            _sum: { totalAmount: true },
          }),
          prisma.inventoryBatch.aggregate({
            where: { tenantId, isActive: true },
            _sum: { currentStock: true },
          }),
          prisma.invoice.count({
            where: { tenantId, createdAt: { gte: today } },
          }),
          prisma.inventoryBatch.count({
            where: {
              tenantId,
              expiryDate: { lte: today },
              currentStock: { gt: 0 },
            },
          }),
        ]);

      return reply.send({
        success: true,
        data: {
          todaySales: todaySalesAgg._sum.totalAmount || 0,
          monthlySales: monthlySalesAgg._sum.totalAmount || 0,
          stockValue: stockAgg._sum.currentStock || 0,
          totalInvoices: invoiceCount,
          expiredMedicines: expiredCount,
        },
      });
    } catch (error) {
      request.log.error({ err: error, tenantId: request.tenantId }, 'Dashboard summary failed');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getExecutiveSummary(request, reply) {
    try {
      const userRole = request.user?.role || 'OWNER';
      const data = await dashboardAggregationService.getExecutiveSummary(
        request.tenantId,
        userRole,
      );
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        {
          err: error.message,
          stack: error.stack,
          tenantId: request.tenantId,
          userRole: request.user?.role,
        },
        'Dashboard overview failed',
      );
      return reply.code(error.statusCode || 500).send({ success: false, message: error.message });
    }
  }

  async getInventoryInsights(request, reply) {
    try {
      const { branchId } = request.query;
      const data = await dashboardAggregationService.getInventoryInsights(
        request.tenantId,
        branchId,
      );
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        { err: error, tenantId: request.tenantId },
        'Dashboard inventory insights failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSalesPerformance(request, reply) {
    try {
      const { branchId, timeframe } = request.query;
      const data = await dashboardAggregationService.getSalesPerformance(
        request.tenantId,
        branchId,
        timeframe,
      );
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        { err: error, tenantId: request.tenantId },
        'Dashboard sales performance failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getPatientAnalytics(request, reply) {
    try {
      const data = await dashboardAggregationService.getPatientAnalytics(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        { err: error, tenantId: request.tenantId },
        'Dashboard patient analytics failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSystemHealth(request, reply) {
    try {
      const data = await dashboardAggregationService.getSystemHealth(request.tenantId);
      return reply.send({ success: true, data });
    } catch (error) {
      request.log.error(
        { err: error, tenantId: request.tenantId },
        'Dashboard system health failed',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new DashboardFastifyController();
