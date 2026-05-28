import salesController from '../fastify/sales.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireBranch } from '../../../middleware/requireBranch.js';

async function salesFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.addHook('preHandler', requireBranch);

  fastify.get('/', {
    schema: { tags: ['Sales'], summary: 'Get sales history' },
    preHandler: [requirePermission('sales.read')],
  }, salesController.getSalesHistory);

  fastify.post('/', {
    schema: { tags: ['Sales'], summary: 'Create a new sale record' },
    preHandler: [requirePermission('sales.create')],
  }, salesController.createSale);

  fastify.get('/trends', {
    schema: { tags: ['Sales'], summary: 'Get sales trends' },
    preHandler: [requirePermission('sales.read')],
  }, salesController.getTrends);

  fastify.post('/summary/manual', {
    schema: { tags: ['Sales'], summary: 'Trigger manual daily summary' },
    preHandler: [requirePermission('sales.admin')],
  }, salesController.triggerManualSummary);

  fastify.get('/:id', {
    schema: { tags: ['Sales'], summary: 'Get sale by ID' },
    preHandler: [requirePermission('sales.read')],
  }, salesController.getSaleById);

  fastify.delete('/:id', {
    schema: { tags: ['Sales'], summary: 'Delete a sale record' },
    preHandler: [requirePermission('sales.delete')],
  }, salesController.deleteSale);

  fastify.post('/:id/refund', {
    schema: { tags: ['Sales'], summary: 'Process refund for a sale' },
    preHandler: [requirePermission('sales.refund')],
  }, salesController.refundSale);
}

export default salesFastifyRoutes;
