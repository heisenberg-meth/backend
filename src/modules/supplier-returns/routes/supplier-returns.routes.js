import supplierReturnController from '../controller/supplier-return.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireFeature } from '../../../middleware/feature.guard.fastify.js';

async function supplierReturnsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/expired/grouped',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Expired stock grouped by supplier',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [requirePermission('inventory.read')],
    },
    supplierReturnController.getExpiredGroupedBySupplier,
  );

  fastify.get(
    '/expired/summary',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Expired inventory summary',
        querystring: {
          type: 'object',
          properties: {
            branchId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [requirePermission('inventory.read')],
    },
    supplierReturnController.getExpiredInventorySummary,
  );

  fastify.post(
    '/',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Create a supplier return' },
      preHandler: [requirePermission('purchases.create')],
    },
    supplierReturnController.createReturn,
  );

  fastify.get(
    '/',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'List supplier returns',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            status: { type: 'string' },
            supplierId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.listReturns,
  );

  const idParam = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    required: ['id'],
  };

  const supplierIdParam = {
    type: 'object',
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
    required: ['supplierId'],
  };

  fastify.get(
    '/credit-notes',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'List credit notes',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
            supplierId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
          },
        },
      },
      preHandler: [requirePermission('purchases.read'), requireFeature('CREDIT_NOTES')],
    },
    supplierReturnController.listCreditNotes,
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Get supplier return detail',
        params: idParam,
      },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getReturnDetail,
  );

  fastify.patch(
    '/:id/status',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Update return status',
        params: idParam,
      },
      preHandler: [requirePermission('purchases.update')],
    },
    supplierReturnController.updateReturnStatus,
  );

  fastify.post(
    '/:id/credit-notes',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Generate credit note for return',
        params: idParam,
      },
      preHandler: [requirePermission('purchases.create'), requireFeature('CREDIT_NOTES')],
    },
    supplierReturnController.generateCreditNote,
  );

  fastify.get(
    '/suppliers/:supplierId/inward',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Supplier inward transactions',
        params: supplierIdParam,
      },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierInwardTransactions,
  );

  fastify.get(
    '/suppliers/:supplierId/returns',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Supplier return transactions',
        params: supplierIdParam,
      },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierReturnTransactions,
  );

  fastify.get(
    '/suppliers/:supplierId/ledger',
    {
      schema: {
        tags: ['Supplier Returns'],
        summary: 'Supplier ledger',
        params: supplierIdParam,
      },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierLedger,
  );
}

export default supplierReturnsRoutes;
