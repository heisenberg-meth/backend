import riskController from '../controllers/risk.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function riskAlertRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // --- Realtime Risk Intelligence ---
  fastify.get(
    '/low-stock',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        querystring: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'] },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    riskController.getLowStockAlerts,
  );

  fastify.get(
    '/expiring',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        querystring: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['INFO', 'WARNING', 'CRITICAL'] },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    riskController.getExpiryAlerts,
  );

  fastify.get(
    '/out-of-stock',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    riskController.getOutOfStock,
  );

  fastify.get(
    '/critical-alerts',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        summary: 'Get all critical pharmaceutical risk alerts',
      },
    },
    riskController.getCriticalAlerts,
  );

  fastify.get(
    '/expiry-summary',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        summary: 'Get a summary of expiring inventory by severity',
      },
    },
    riskController.getExpirySummary,
  );

  fastify.get(
    '/alert-trends',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        summary: 'Get alert trends over the last 30 days',
      },
    },
    riskController.getAlertTrends,
  );

  fastify.get(
    '/reorder-recommendations',
    {
      schema: {
        tags: ['Medicines', 'Alerts', 'Procurement'],
        querystring: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    riskController.getReorderRecommendations,
  );

  // --- Operational Tools ---
  fastify.post(
    '/alerts/scan',
    {
      schema: {
        tags: ['Medicines', 'Alerts'],
        summary: 'Manually trigger a comprehensive pharmaceutical risk scan',
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    riskController.triggerExpiryScan,
  );
}

export default riskAlertRoutes;
