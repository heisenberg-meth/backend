import crmController from '../controllers/crm.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function crmRoutes(fastify) {
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', requireTenant);
  fastify.get('/patients/:id/behavior', crmController.getBehavior);
  fastify.get('/segments', crmController.getSegments);
  fastify.get('/reminders', crmController.getReminders);
  fastify.post('/reminders', { preHandler: [requirePermission('VIEW_SALES')] }, crmController.createReminder);
  fastify.get('/subscriptions', crmController.getSubscriptions);
  fastify.post('/subscriptions', { preHandler: [requirePermission('VIEW_SALES')] }, crmController.createSubscription);
  fastify.post('/campaigns', { preHandler: [requirePermission('VIEW_SALES')] }, crmController.launchCampaign);
}
