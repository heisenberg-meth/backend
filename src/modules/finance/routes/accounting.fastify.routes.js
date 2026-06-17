import expenseController from '../fastify/expense.fastify.controller.js';
import taxController from '../fastify/tax.fastify.controller.js';
import tallyController from '../fastify/tally.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireFeature } from '../../../middleware/feature.guard.fastify.js';

async function accountingFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/expenses',
    {
      schema: { tags: ['Finance'], summary: 'List expenses' },
      preHandler: [requirePermission('finance.read')],
    },
    expenseController.getExpenses,
  );

  fastify.post(
    '/expenses',
    {
      schema: { tags: ['Finance'], summary: 'Create an expense' },
      preHandler: [requirePermission('finance.create')],
    },
    expenseController.createExpense,
  );

  fastify.put(
    '/expenses/:id',
    {
      schema: { tags: ['Finance'], summary: 'Update an expense' },
      preHandler: [requirePermission('finance.update')],
    },
    expenseController.updateExpense,
  );

  fastify.delete(
    '/expenses/:id',
    {
      schema: { tags: ['Finance'], summary: 'Delete an expense' },
      preHandler: [requirePermission('finance.delete')],
    },
    expenseController.deleteExpense,
  );

  fastify.get(
    '/expenses/categories',
    {
      schema: { tags: ['Finance'], summary: 'List expense categories' },
      preHandler: [requirePermission('finance.read')],
    },
    expenseController.getCategories,
  );

  fastify.post(
    '/expenses/categories',
    {
      schema: { tags: ['Finance'], summary: 'Create expense category' },
      preHandler: [requirePermission('finance.create')],
    },
    expenseController.createCategory,
  );

  fastify.get(
    '/tax/gst-summary',
    {
      schema: { tags: ['Finance'], summary: 'Get GST summary' },
      preHandler: [requirePermission('finance.read')],
    },
    taxController.getGstSummary,
  );

  fastify.post(
    '/tax/gst-summary',
    {
      schema: { tags: ['Finance'], summary: 'Generate monthly GST summary' },
      preHandler: [requirePermission('finance.create')],
    },
    taxController.generateGstSummary,
  );

  fastify.get(
    '/tax/profit-loss',
    {
      schema: { tags: ['Finance'], summary: 'Get profit & loss statement' },
      preHandler: [requirePermission('finance.read')],
    },
    taxController.getProfitLoss,
  );

  fastify.get(
    '/tax/reconcile-sales',
    {
      schema: { tags: ['Finance'], summary: 'Reconcile sales invoices' },
      preHandler: [requirePermission('finance.admin')],
    },
    taxController.reconcileSales,
  );

  fastify.get(
    '/tally/export/sales',
    {
      schema: { tags: ['Finance'], summary: 'Export sales to Tally XML' },
      preHandler: [requirePermission('finance.read'), requireFeature('ADVANCED_REPORTS')],
    },
    tallyController.exportSales,
  );

  fastify.get(
    '/tally/export/history',
    {
      schema: { tags: ['Finance'], summary: 'Tally export history' },
      preHandler: [requirePermission('finance.read')],
    },
    tallyController.getExportHistory,
  );
}

export default accountingFastifyRoutes;
