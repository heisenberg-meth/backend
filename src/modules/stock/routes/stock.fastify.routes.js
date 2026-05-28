import stockController from '../fastify/stock.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function stockFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/in', {
    schema: { tags: ['Stock'], summary: 'Record stock inbound (purchase/receiving)' },
    preHandler: [requirePermission('inventory.update')],
  }, stockController.stockIn);

  fastify.post('/out', {
    schema: { tags: ['Stock'], summary: 'Record stock outbound (sale/adjustment)' },
    preHandler: [requirePermission('inventory.update')],
  }, stockController.stockOut);

  fastify.post('/damage', {
    schema: { tags: ['Stock'], summary: 'Record damaged stock' },
    preHandler: [requirePermission('inventory.update')],
  }, stockController.recordDamage);

  fastify.get('/history', {
    schema: { tags: ['Stock'], summary: 'Get stock movement history' },
    preHandler: [requirePermission('inventory.read')],
  }, stockController.getHistory);

  fastify.get('/alerts', {
    schema: { tags: ['Stock'], summary: 'Get active stock alerts' },
    preHandler: [requirePermission('inventory.read')],
  }, stockController.getAlerts);

  fastify.put('/alerts/:id/resolve', {
    schema: { tags: ['Stock'], summary: 'Resolve a stock alert' },
    preHandler: [requirePermission('inventory.update')],
  }, stockController.resolveAlert);

  fastify.get('/current/:medicineId', {
    schema: { tags: ['Stock'], summary: 'Get current stock for a medicine' },
    preHandler: [requirePermission('inventory.read')],
  }, stockController.getCurrentStock);
}

export default stockFastifyRoutes;
