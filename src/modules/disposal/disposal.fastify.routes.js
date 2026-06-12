import disposalController from './disposal.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';

async function disposalRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/expired',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Get all expired batches for disposal',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
      },
    },
    disposalController.getExpiredBatches,
  );

  fastify.get(
    '/expired/overview',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Get overview of expired inventory (totals, value)',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
      },
    },
    disposalController.getExpiredOverview,
  );

  fastify.post(
    '/disposal/bulk',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Bulk dispose expired medicines',
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['medicineId', 'batchId', 'quantity'],
                properties: {
                  medicineId: { type: 'string' },
                  batchId: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
            reason: { type: 'string' },
          },
        },
      },
    },
    disposalController.bulkDispose,
  );

  fastify.get(
    '/disposal/history',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Get disposal history',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
    },
    disposalController.getDisposalHistory,
  );
}

export default disposalRoutes;
