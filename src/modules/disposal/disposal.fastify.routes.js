import disposalController from './disposal.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

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

  /**
   * GET /api/inventory/expired/clearable
   * Returns the count of disposed/archived batches eligible for inventory cleanup.
   */
  fastify.get(
    '/expired/clearable',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Get count of disposed expired batches eligible for inventory cleanup',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      preHandler: [requirePermission('inventory.read')],
    },
    disposalController.getClearableCount,
  );

  /**
   * POST /api/inventory/expired/clear
   * Archives all disposed expired batches, removing them from active inventory views.
   * Requires inventory.update permission (ADMIN / OWNER roles bypass).
   */
  fastify.post(
    '/expired/clear',
    {
      schema: {
        tags: ['Disposal'],
        summary: 'Clear (archive) all disposed expired batches from active inventory',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  cleared: { type: 'integer' },
                  skipped: { type: 'integer' },
                  failed: { type: 'integer' },
                  remaining: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      preHandler: [requirePermission('inventory.update')],
    },
    disposalController.clearExpired,
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

