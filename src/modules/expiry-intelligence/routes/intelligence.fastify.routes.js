import expiryController from '../fastify/expiry.fastify.controller.js';
import batchIntelController from '../fastify/batch-intel.fastify.controller.js';
import recommendationController from '../fastify/recommendation.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function intelligenceFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.get(
    '/alerts',
    {
      schema: { tags: ['Expiry'], summary: 'Active expiry alerts' },
      preHandler: [requirePermission('inventory.read')],
    },
    expiryController.getActiveAlerts,
  );
  fastify.get(
    '/critical',
    {
      schema: { tags: ['Expiry'], summary: 'Critical expiry alerts' },
      preHandler: [requirePermission('inventory.read')],
    },
    expiryController.getCriticalAlerts,
  );
  fastify.put(
    '/alerts/:id/resolve',
    {
      schema: { tags: ['Expiry'], summary: 'Resolve expiry alert' },
      preHandler: [requirePermission('inventory.update')],
    },
    expiryController.resolveAlert,
  );
  fastify.post(
    '/scan/manual',
    {
      schema: { tags: ['Expiry'], summary: 'Trigger manual expiry scan' },
      preHandler: [requirePermission('settings.manage')],
    },
    expiryController.triggerManualScan,
  );
  fastify.get(
    '/batches',
    {
      schema: { tags: ['Expiry'], summary: 'Get batches with filters' },
      preHandler: [requirePermission('inventory.read')],
    },
    batchIntelController.getBatches,
  );
  fastify.get(
    '/batches/near-expiry',
    {
      schema: { tags: ['Expiry'], summary: 'Near expiry batches' },
      preHandler: [requirePermission('inventory.read')],
    },
    batchIntelController.getNearExpiryBatches,
  );
  fastify.post(
    '/batches/quarantine',
    {
      schema: { tags: ['Expiry'], summary: 'Quarantine a batch' },
      preHandler: [requirePermission('inventory.update')],
    },
    batchIntelController.quarantineBatch,
  );
  fastify.get(
    '/recommendations',
    {
      schema: { tags: ['Expiry'], summary: 'Get recommendations' },
      preHandler: [requirePermission('reports.read')],
    },
    recommendationController.getRecommendations,
  );
  fastify.post(
    '/recommendations/generate',
    {
      schema: { tags: ['Expiry'], summary: 'Generate recommendations' },
      preHandler: [requirePermission('settings.manage')],
    },
    recommendationController.triggerManualGeneration,
  );
}

export default intelligenceFastifyRoutes;
