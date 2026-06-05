import dashboardController from '../fastify/dashboard.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

async function dashboardFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/summary',
    {
      schema: { tags: ['Dashboard'], summary: 'Unified dashboard summary with key metrics' },
    },
    dashboardController.getDashboardSummary,
  );

  fastify.get(
    '/overview',
    {
      schema: { tags: ['Dashboard'], summary: 'Executive summary overview' },
    },
    dashboardController.getExecutiveSummary,
  );

  fastify.get(
    '/sales-summary',
    {
      schema: { tags: ['Dashboard'], summary: 'Sales performance summary' },
    },
    dashboardController.getSalesPerformance,
  );

  fastify.get(
    '/inventory-health',
    {
      schema: { tags: ['Dashboard'], summary: 'Inventory health insights' },
    },
    dashboardController.getInventoryInsights,
  );

  fastify.get(
    '/patients',
    {
      schema: { tags: ['Dashboard'], summary: 'Patient analytics' },
    },
    dashboardController.getPatientAnalytics,
  );

  fastify.get(
    '/health',
    {
      schema: { tags: ['Dashboard'], summary: 'System health status' },
    },
    dashboardController.getSystemHealth,
  );
}

export default dashboardFastifyRoutes;
