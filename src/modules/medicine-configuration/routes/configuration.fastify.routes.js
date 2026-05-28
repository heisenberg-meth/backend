import configurationController from '../controllers/configuration.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function configurationRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.patch(
    '/:id/reorder-point',
    {
      preHandler: [requirePermission('MEDICINE_REORDER_UPDATE')],
      schema: {
        tags: ['Medicines', 'Configuration'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['reorderPoint'],
          properties: {
            reorderPoint: { type: 'integer', minimum: 0 },
            safetyStock: { type: 'integer', minimum: 0, default: 0 },
            maxStockLimit: { type: 'integer' },
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    configurationController.updateReorderPoint,
  );

  fastify.patch(
    '/:id/pricing',
    {
      preHandler: [requirePermission('MEDICINE_PRICING_UPDATE')],
      schema: {
        tags: ['Medicines', 'Configuration', 'Finance'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['mrp', 'sellingPrice', 'purchasePrice'],
          properties: {
            mrp: { type: 'number', exclusiveMinimum: 0 },
            sellingPrice: { type: 'number', exclusiveMinimum: 0 },
            purchasePrice: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    configurationController.updatePricing,
  );

  fastify.patch(
    '/:id/status',
    {
      preHandler: [requirePermission('MEDICINE_STATUS_UPDATE')],
      schema: {
        tags: ['Medicines', 'Configuration'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'BLOCKED', 'RESTRICTED'],
            },
            reason: { type: 'string' },
          },
        },
      },
    },
    configurationController.updateStatus,
  );

  fastify.patch(
    '/bulk-pricing',
    {
      preHandler: [requirePermission('MEDICINE_BULK_PRICING')],
      schema: {
        tags: ['Medicines', 'Configuration'],
        body: {
          type: 'object',
          required: ['updates'],
          properties: {
            updates: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['medicineId', 'mrp', 'sellingPrice', 'purchasePrice'],
                properties: {
                  medicineId: { type: 'string', format: 'uuid' },
                  mrp: { type: 'number', exclusiveMinimum: 0 },
                  sellingPrice: { type: 'number', exclusiveMinimum: 0 },
                  purchasePrice: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    configurationController.bulkUpdatePricing,
  );

  fastify.get(
    '/:id/reorder-analytics',
    {
      schema: {
        tags: ['Medicines', 'Configuration'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    configurationController.getReorderAnalytics,
  );

  fastify.get(
    '/:id/pricing-history',
    {
      schema: {
        tags: ['Medicines', 'Configuration'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    configurationController.getPricingHistory,
  );

  fastify.get(
    '/:id/status-history',
    {
      schema: {
        tags: ['Medicines', 'Configuration'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    configurationController.getStatusHistory,
  );
}

export default configurationRoutes;
