import batchController from '../fastify/batch.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function batchFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/fefo/:medicineId',
    {
      schema: { tags: ['Batches'], summary: 'Get FEFO-ordered batches for a medicine' },
    },
    batchController.getFefoBatches,
  );

  fastify.get(
    '/quarantined',
    {
      schema: { tags: ['Batches'], summary: 'List quarantined batches' },
    },
    batchController.getQuarantined,
  );

  fastify.post(
    '/:id/quarantine',
    {
      schema: { tags: ['Batches'], summary: 'Quarantine a batch' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.quarantineBatch,
  );

  fastify.post(
    '/:id/recall',
    {
      schema: { tags: ['Batches'], summary: 'Recall a batch' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.recallBatch,
  );

  fastify.post(
    '/:id/release',
    {
      schema: { tags: ['Batches'], summary: 'Release batch from quarantine' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.releaseQuarantine,
  );

  fastify.get(
    '/',
    {
      schema: { tags: ['Batches'], summary: 'List batches with filters' },
    },
    batchController.getBatches,
  );

  fastify.get(
    '/:id',
    {
      schema: { tags: ['Batches'], summary: 'Get batch by ID' },
    },
    batchController.getBatchById,
  );

  fastify.post(
    '/',
    {
      schema: { tags: ['Batches'], summary: 'Create a new batch' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.createBatch,
  );

  fastify.put(
    '/:id',
    {
      schema: { tags: ['Batches'], summary: 'Update a batch' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.updateBatch,
  );

  fastify.delete(
    '/:id',
    {
      schema: { tags: ['Batches'], summary: 'Delete a batch' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.deleteBatch,
  );
}

export default batchFastifyRoutes;
