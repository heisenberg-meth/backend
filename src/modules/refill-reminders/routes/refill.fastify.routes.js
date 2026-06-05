import refillController from '../fastify/refill.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function refillFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/upcoming-refills',
    {
      schema: { tags: ['Refills'], summary: 'Get upcoming refills' },
      preHandler: [requirePermission('sales.read')],
    },
    refillController.getUpcomingRefills,
  );

  fastify.post(
    '/:id/send-refill-reminder',
    {
      schema: { tags: ['Refills'], summary: 'Send manual refill reminder' },
      preHandler: [requirePermission('sales.create')],
    },
    refillController.sendManualReminder,
  );
  fastify.get(
    '/:id/adherence',
    {
      schema: { tags: ['Refills'], summary: 'Get patient adherence' },
      preHandler: [requirePermission('sales.read')],
    },
    refillController.getAdherence,
  );
  fastify.get(
    '/:id/reminders/history',
    {
      schema: { tags: ['Refills'], summary: 'Get reminder history' },
      preHandler: [requirePermission('sales.read')],
    },
    refillController.getReminderHistory,
  );
}

export default refillFastifyRoutes;
