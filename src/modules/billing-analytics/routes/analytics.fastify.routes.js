import analyticsController from '../controllers/analytics.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function analyticsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/daily-summary',
    {
      schema: {
        tags: ['Analytics'],
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    analyticsController.getDailySummary,
  );

  fastify.get(
    '/payment-breakdown',
    {
      schema: {
        tags: ['Analytics'],
        querystring: {
          type: 'object',
          properties: {
            date: { type: 'string', format: 'date' },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    analyticsController.getPaymentBreakdown,
  );

  fastify.get(
    '/today-sales',
    {
      schema: {
        tags: ['Analytics'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 20 },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    analyticsController.getTodaySales,
  );

  fastify.get(
    '/cash-register',
    {
      schema: {
        tags: ['Analytics', 'Finance'],
      },
    },
    analyticsController.handleCashRegister,
  );

  fastify.post(
    '/cash-register',
    {
      schema: {
        tags: ['Analytics', 'Finance'],
        body: {
          type: 'object',
          properties: {
            openingCash: { type: 'number' },
            notes: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('VIEW_FINANCIALS')],
    },
    analyticsController.handleCashRegister,
  );

  fastify.post(
    '/cash-register/close',
    {
      schema: {
        tags: ['Analytics', 'Finance'],
        body: {
          type: 'object',
          required: ['sessionId', 'closingCash'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            closingCash: { type: 'number' },
            notes: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('VIEW_FINANCIALS')],
    },
    analyticsController.closeCashRegister,
  );

  fastify.get(
    '/cash-register/history',
    {
      schema: {
        tags: ['Analytics', 'Finance'],
        querystring: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'date-time' },
            to: { type: 'string', format: 'date-time' },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    analyticsController.getRegisterHistory,
  );
}

export default analyticsRoutes;
