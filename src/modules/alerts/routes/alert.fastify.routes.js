import alertController from '../fastify/alert.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function alertFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.get('/', { schema: { tags: ['Alerts'], summary: 'Get all alerts' } }, alertController.getAll);
  fastify.get('/low-stock', { schema: { tags: ['Alerts'], summary: 'Get low stock alerts' } }, alertController.getLowStock);
  fastify.get('/expiring', { schema: { tags: ['Alerts'], summary: 'Get expiring alerts' } }, alertController.getExpiring);
  fastify.get('/critical', { schema: { tags: ['Alerts'], summary: 'Get critical alerts' } }, alertController.getCritical);
  fastify.get('/escalated', { schema: { tags: ['Alerts'], summary: 'Get escalated alerts' } }, alertController.getEscalated);
  fastify.get('/analytics', { schema: { tags: ['Alerts'], summary: 'Alert analytics' } }, alertController.getAnalytics);
  fastify.post('/:alertId/snooze', { schema: { tags: ['Alerts'], summary: 'Snooze an alert' }, preHandler: [requirePermission('VIEW_INVENTORY')] }, alertController.snooze);
  fastify.post('/:alertId/mark-on-order', { schema: { tags: ['Alerts'], summary: 'Mark alert as on order' }, preHandler: [requirePermission('VIEW_INVENTORY')] }, alertController.markOnOrder);
  fastify.post('/:alertId/raise-po', { schema: { tags: ['Alerts'], summary: 'Raise PO from alert' }, preHandler: [requirePermission('VIEW_INVENTORY')] }, alertController.raisePurchaseOrder);
  fastify.post('/:alertId/resolve', { schema: { tags: ['Alerts'], summary: 'Resolve an alert' }, preHandler: [requirePermission('VIEW_INVENTORY')] }, alertController.resolve);
  fastify.post('/escalation-scan', { schema: { tags: ['Alerts'], summary: 'Trigger escalation scan' }, preHandler: [requirePermission('VIEW_INVENTORY')] }, alertController.triggerEscalationScan);
}

export default alertFastifyRoutes;
