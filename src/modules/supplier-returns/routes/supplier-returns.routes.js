import supplierReturnController from '../controller/supplier-return.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function supplierReturnsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/expired/grouped',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Expired stock grouped by supplier' },
      preHandler: [requirePermission('inventory.read')],
    },
    supplierReturnController.getExpiredGroupedBySupplier,
  );

  fastify.get(
    '/expired/summary',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Expired inventory summary' },
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
      schema: { tags: ['Supplier Returns'], summary: 'List supplier returns' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.listReturns,
  );

  fastify.get(
    '/:id',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Get supplier return detail' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getReturnDetail,
  );

  fastify.patch(
    '/:id/status',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Update return status' },
      preHandler: [requirePermission('purchases.update')],
    },
    supplierReturnController.updateReturnStatus,
  );

  fastify.post(
    '/:id/credit-notes',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Generate credit note for return' },
      preHandler: [requirePermission('purchases.create')],
    },
    supplierReturnController.generateCreditNote,
  );

  fastify.get(
    '/credit-notes',
    {
      schema: { tags: ['Supplier Returns'], summary: 'List credit notes' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.listCreditNotes,
  );

  fastify.get(
    '/suppliers/:supplierId/inward',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Supplier inward transactions' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierInwardTransactions,
  );

  fastify.get(
    '/suppliers/:supplierId/returns',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Supplier return transactions' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierReturnTransactions,
  );

  fastify.get(
    '/suppliers/:supplierId/ledger',
    {
      schema: { tags: ['Supplier Returns'], summary: 'Supplier ledger' },
      preHandler: [requirePermission('purchases.read')],
    },
    supplierReturnController.getSupplierLedger,
  );
}

export default supplierReturnsRoutes;
