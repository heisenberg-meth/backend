import analyticsController from './controller/analytics.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';
import auditService from '../audit/service/audit.prisma.service.js';

/**
 * Simple audit logging hook for analytics endpoints
 */
const auditAnalytics = async (request, reply, payload) => {
  const { tenantId, user } = request;
  if (tenantId && user) {
    auditService.log({
      tenantId,
      userId: user.id,
      action: `ANALYTICS_VIEW`,
      target: `${request.routeOptions?.url || request.url}`,
      type: 'SYSTEM',
      username: user.fullName,
    }).catch(() => {});
  }
  return payload;
};

async function analyticsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // Core analytics (general read)
  fastify.get(
    '/stats',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get dashboard statistics (PostgreSQL)',
      },
      preHandler: [requirePermission('analytics.read')],
      onResponse: (request, reply, done) => {
        auditAnalytics(request, reply);
        done();
      },
    },
    analyticsController.getDashboardStats,
  );

  fastify.get(
    '/inventory-distribution',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Get inventory distribution by supplier',
      },
      preHandler: [requirePermission('analytics.read')],
    },
    analyticsController.getInventoryDistribution,
  );

  fastify.get('/revenue-vs-cost', {
    schema: { tags: ['Analytics'], summary: 'Revenue vs cost of goods sold by month' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getRevenueVsCost);

  fastify.get('/supplier-spend', {
    schema: { tags: ['Analytics'], summary: 'Total spend per supplier last 12 months with concentration risk detection' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getSupplierSpend);

  fastify.get('/low-stock-trends', {
    schema: { tags: ['Analytics'], summary: 'Low stock counts over last 30 days' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getLowStockTrends);

  fastify.get('/top-selling-medicines', {
    schema: { tags: ['Analytics'], summary: 'Top 10 medicines by revenue' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getTopSellingMedicines);

  fastify.get('/expiry-loss-report', {
    schema: { tags: ['Analytics'], summary: 'Total value of expired stock with supplier shelf-life analysis' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getExpiryLossReport);

  fastify.get('/profit-margin', {
    schema: { tags: ['Analytics'], summary: 'Average profit margin with negative margin detection and distribution analysis' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getProfitMargin);

  fastify.get('/staff-sales', {
    schema: { tags: ['Analytics'], summary: 'Sales grouped by staff member' },
    preHandler: [requirePermission('analytics.staff.read')],
  }, analyticsController.getStaffSales);

  fastify.get('/payment-methods', {
    schema: { tags: ['Analytics'], summary: 'Payment method breakdown with fraud-relevant metrics' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getPaymentMethods);

  fastify.get('/hourly-sales', {
    schema: { tags: ['Analytics'], summary: 'Revenue breakdown by hour for today' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getHourlySales);

  // ===================== ENTERPRISE ANALYTICS ROUTES =====================

  fastify.get('/fraud-signals', {
    schema: { tags: ['Analytics'], summary: 'Fraud detection signals: anomalous refunds, cash spikes, excessive discounts, price anomalies' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getFraudSignals);

  fastify.get('/forecast', {
    schema: { tags: ['Analytics'], summary: 'Forecast dashboard with demand predictions, reorder recommendations, seasonal trends, and expiry risk' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getForecastDashboard);

  fastify.get('/branch-performance', {
    schema: { tags: ['Analytics'], summary: 'Branch performance metrics: revenue, profit, turnover, expiry loss per branch' },
    preHandler: [requirePermission('analytics.financial.read')],
  }, analyticsController.getBranchPerformance);

  // ===================== ADVANCED BI ROUTES =====================

  fastify.get('/bi/fast-moving', {
    schema: { tags: ['Analytics BI'], summary: 'Get fast-moving medicines by sales velocity (supports ?branchId=)' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getFastMoving);

  fastify.get('/bi/slow-moving', {
    schema: { tags: ['Analytics BI'], summary: 'Get slow-moving stock (>60 days no sale) (supports ?branchId=)' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getSlowMovingBI);

  fastify.get('/bi/dead-stock', {
    schema: { tags: ['Analytics BI'], summary: 'Get dead stock analysis (>120 days no sale) (supports ?branchId=)' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getDeadStock);

  fastify.get('/bi/revenue-heatmap', {
    schema: { tags: ['Analytics BI'], summary: 'Get revenue aggregation by hour and weekday (supports ?branchId=)' },
    preHandler: [requirePermission('analytics.read')],
  }, analyticsController.getRevenueHeatmap);
}

export default analyticsRoutes;
