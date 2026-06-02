import controller from './controllers/alert-settings.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function alertSettingsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.get(
    '/alerts',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Get operational risk alert settings',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('settings.alerts.read')],
    },
    controller.getSettings,
  );

  fastify.put(
    '/alerts',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Update operational risk alert settings',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            lowStockThreshold: { type: 'integer', minimum: 0 },
            criticalStockThreshold: { type: 'integer', minimum: 0 },
            expiryWarningDays: { type: 'integer', minimum: 0 },
            criticalExpiryDays: { type: 'integer', minimum: 0 },
            autoRaisePO: { type: 'boolean' },
            escalationHours: { type: 'integer', minimum: 1 },
          },
        },
      },
      preHandler: [requirePermission('settings.alerts.update')],
    },
    controller.updateSettings,
  );

  fastify.get(
    '/alerts/:settingsId/overrides',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'List medicine-specific threshold overrides',
        params: {
          type: 'object',
          required: ['settingsId'],
          properties: { settingsId: { type: 'string' } },
        },
      },
      preHandler: [requirePermission('settings.alerts.read')],
    },
    controller.getOverrides,
  );

  fastify.post(
    '/alerts/:settingsId/overrides',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Create medicine-specific threshold override',
        params: {
          type: 'object',
          required: ['settingsId'],
          properties: { settingsId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['medicineId'],
          properties: {
            medicineId: { type: 'string', format: 'uuid' },
            lowStockThreshold: { type: 'integer', minimum: 0 },
            criticalStockThreshold: { type: 'integer', minimum: 0 },
            expiryWarningDays: { type: 'integer', minimum: 0 },
            criticalExpiryDays: { type: 'integer', minimum: 0 },
          },
        },
      },
      preHandler: [requirePermission('alerts.threshold.manage')],
    },
    controller.createOverride,
  );

  fastify.put(
    '/alerts/overrides/:id',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Update medicine-specific threshold override',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            lowStockThreshold: { type: 'integer', minimum: 0 },
            criticalStockThreshold: { type: 'integer', minimum: 0 },
            expiryWarningDays: { type: 'integer', minimum: 0 },
            criticalExpiryDays: { type: 'integer', minimum: 0 },
          },
        },
      },
      preHandler: [requirePermission('alerts.threshold.manage')],
    },
    controller.updateOverride,
  );

  fastify.delete(
    '/alerts/overrides/:id',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Delete medicine-specific threshold override',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: [requirePermission('alerts.threshold.manage')],
    },
    controller.deleteOverride,
  );

  fastify.post(
    '/alerts/test',
    {
      schema: {
        tags: ['Alert Settings'],
        summary: 'Test alert threshold evaluation logic',
        body: {
          type: 'object',
          required: ['medicineId', 'currentStock', 'expiryDate'],
          properties: {
            medicineId: { type: 'string', format: 'uuid' },
            currentStock: { type: 'integer' },
            expiryDate: { type: 'string', format: 'date-time' },
            branchId: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('settings.alerts.update')],
    },
    controller.testAlertRules,
  );
}

export default alertSettingsRoutes;
