import reportController from '../fastify/report.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function reportFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/sales',
    {
      schema: { tags: ['Reports'], summary: 'Sales report' },
      preHandler: [requirePermission('reports.read')],
    },
    reportController.getSalesReport,
  );

  fastify.get(
    '/purchases',
    {
      schema: { tags: ['Reports'], summary: 'Purchase report' },
      preHandler: [requirePermission('reports.read')],
    },
    reportController.getPurchaseReport,
  );

  fastify.get(
    '/finance',
    {
      schema: { tags: ['Reports'], summary: 'Finance report' },
      preHandler: [requirePermission('reports.financial')],
    },
    reportController.getFinanceReport,
  );

  fastify.get(
    '/expiry',
    {
      schema: { tags: ['Reports'], summary: 'Expiry report' },
      preHandler: [requirePermission('reports.read')],
    },
    reportController.getExpiryReport,
  );

  fastify.get(
    '/export/sales',
    {
      schema: { tags: ['Reports'], summary: 'Export sales report (excel/pdf)' },
      preHandler: [requirePermission('reports.read')],
    },
    reportController.exportSalesReport,
  );

  fastify.post(
    '/aggregate/manual',
    {
      schema: { tags: ['Reports'], summary: 'Trigger manual aggregation for a single date' },
      preHandler: [requirePermission('reports.admin')],
    },
    reportController.triggerManualAggregation,
  );

  fastify.post(
    '/reaggregate',
    {
      schema: { tags: ['Reports'], summary: 'Rebuild all daily summaries for a date range' },
      preHandler: [requirePermission('reports.admin')],
    },
    reportController.reaggregateRange,
  );
}

export default reportFastifyRoutes;
