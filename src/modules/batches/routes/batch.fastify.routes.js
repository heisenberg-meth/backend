import batchController from '../fastify/batch.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireLimit } from '../../../middleware/feature.guard.fastify.js';
import prisma from '../../../config/prisma.js';

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

  fastify.post(
    '/bulk-assign-supplier',
    {
      schema: {
        tags: ['Batches'],
        summary: 'Bulk assign supplier to batches',
        body: {
          type: 'object',
          properties: {
            batchIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
            supplierId: { type: 'string', format: 'uuid' },
          },
          required: ['batchIds'],
        },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.bulkAssignSupplier,
  );

  fastify.post(
    '/backfill-supplier',
    {
      schema: {
        tags: ['Batches'],
        summary: 'Backfill supplier IDs from medicine supplier history',
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.backfillSupplierFromMedicine,
  );

  fastify.get(
    '/export-no-supplier',
    {
      schema: {
        tags: ['Batches'],
        summary: 'Export batches without supplier for CSV editing',
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.exportBatchesWithoutSupplier,
  );

  fastify.post(
    '/import-supplier-assignments',
    {
      schema: {
        tags: ['Batches'],
        summary: 'Import supplier assignments from CSV data',
        body: {
          type: 'object',
          properties: {
            assignments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  batchId: { type: 'string' },
                  supplierName: { type: 'string' },
                },
              },
            },
          },
          required: ['assignments'],
        },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.importSupplierAssignments,
  );

  fastify.patch(
    '/:id/supplier',
    {
      schema: {
        tags: ['Batches'],
        summary: 'Assign supplier to a batch',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            supplierId: { type: ['string', 'null'], format: 'uuid' },
          },
          required: ['supplierId'],
        },
      },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    batchController.assignSupplier,
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
      preHandler: [
        requirePermission('VIEW_INVENTORY'),
        requireLimit('batches', async (req) => {
          return await prisma.inventoryBatch.count({
            where: { tenantId: req.tenantId, deletedAt: null },
          });
        }),
      ],
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
