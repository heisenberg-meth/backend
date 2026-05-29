import controller from '../fastify/communications.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/patients/:id/send-refill-reminder', {
    schema: { tags: ['Communications'], summary: 'Send refill reminder with full orchestration' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.sendRefillReminder,
  });

  fastify.post('/patients/:id/send-prescription-reminder', {
    schema: { tags: ['Communications'], summary: 'Send prescription expiry/renewal reminder' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.sendPrescriptionReminder,
  });

  fastify.post('/patients/:id/send-invoice', {
    schema: { tags: ['Communications'], summary: 'Send invoice via preferred channel' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.sendInvoice,
  });

  fastify.post('/patients/:id/preferences', {
    schema: { tags: ['Communications'], summary: 'Update patient communication preferences' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.updatePreferences,
  });

  fastify.get('/patients/:id/reminders', {
    schema: { tags: ['Communications'], summary: 'Analyze upcoming refill/prescription reminders' },
    handler: controller.analyzeReminders,
  });

  fastify.get('/patients/:id/adherence', {
    schema: { tags: ['Communications'], summary: 'Get adherence formula for a medicine' },
    handler: controller.getAdherence,
  });

  fastify.get('/patients/:id/communications', {
    schema: { tags: ['Communications'], summary: 'Get patient communication history' },
    handler: controller.getPatientCommunications,
  });

  fastify.get('/:id/status', {
    schema: { tags: ['Communications'], summary: 'Get communication delivery status' },
    handler: controller.getStatus,
  });

  fastify.post('/:id/retry', {
    schema: { tags: ['Communications'], summary: 'Retry failed communication delivery' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.retryCommunication,
  });

  fastify.post('/scan', {
    schema: { tags: ['Communications'], summary: 'Trigger adherence engine scan' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.scanAll,
  });
}
