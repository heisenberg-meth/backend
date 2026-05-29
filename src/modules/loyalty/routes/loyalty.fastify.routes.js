import controller from '../fastify/loyalty.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // ── Analytics ─────────────────────────────────────────────────
  fastify.get('/analytics/loyalty', {
    schema: { tags: ['Loyalty'], summary: 'Get aggregate loyalty analytics' },
    handler: controller.getLoyaltyAnalytics,
  });

  fastify.get('/analytics/credit', {
    schema: { tags: ['Loyalty'], summary: 'Get aggregate credit risk analytics' },
    handler: controller.getCreditAnalytics,
  });

  // ── Profile & Core Operations ─────────────────────────────────
  fastify.get('/:id', {
    schema: { tags: ['Loyalty'], summary: 'Get loyalty profile by patient ID' },
    handler: controller.getLoyaltyProfile,
  });

  fastify.post('/:id/redeem', {
    schema: { tags: ['Loyalty'], summary: 'Redeem points for discount' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.redeemPoints,
  });

  fastify.post('/:id/credit', {
    schema: { tags: ['Loyalty'], summary: 'Issue credit / outstanding dues' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.addCredit,
  });

  fastify.post('/:id/credit-payment', {
    schema: { tags: ['Loyalty'], summary: 'Record payment against credit balance' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.makePayment,
  });

  // ── Transaction & History Logs ────────────────────────────────
  fastify.get('/:id/loyalty-transactions', {
    schema: { tags: ['Loyalty'], summary: 'Get point transaction history' },
    handler: controller.getLoyaltyHistory,
  });

  fastify.get('/:id/credit-ledger', {
    schema: { tags: ['Loyalty'], summary: 'Get credit ledger history' },
    handler: controller.getCreditLedger,
  });
}
