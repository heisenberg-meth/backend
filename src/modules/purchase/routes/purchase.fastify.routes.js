import purchaseController from '../fastify/purchase.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';
import { requireFeature } from '../../../middleware/feature.guard.fastify.js';

async function purchaseFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post(
    '/receive',
    {
      schema: { tags: ['Purchase'], summary: 'Receive goods and update inventory' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    purchaseController.receiveGoods,
  );

  fastify.post(
    '/returns',
    {
      schema: { tags: ['Purchase'], summary: 'Create a purchase return' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    purchaseController.createReturn,
  );

  fastify.get(
    '/returns',
    {
      schema: { tags: ['Purchase'], summary: 'List purchase returns' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    purchaseController.getReturns,
  );
  fastify.get(
    '/credit-notes',
    {
      schema: { tags: ['Purchase'], summary: 'List credit notes' },
      preHandler: [requirePermission('VIEW_INVENTORY'), requireFeature('CREDIT_NOTES')],
    },
    purchaseController.getCreditNotes,
  );

  fastify.get(
    '/credit-notes/:id',
    {
      schema: { tags: ['Purchase'], summary: 'Get credit note details' },
      preHandler: [requirePermission('VIEW_INVENTORY'), requireFeature('CREDIT_NOTES')],
    },
    purchaseController.getCreditNoteById,
  );

  fastify.post(
    '/credit-notes/:id/apply',
    {
      schema: { tags: ['Purchase'], summary: 'Apply credit note to a purchase invoice' },
      preHandler: [requirePermission('MANAGE_INVENTORY'), requireFeature('CREDIT_NOTES')],
    },
    purchaseController.applyCreditNote,
  );

  fastify.get(
    '/suppliers/:id/credit-balance',
    {
      schema: { tags: ['Purchase'], summary: 'Get supplier credit balance' },
      preHandler: [requirePermission('VIEW_INVENTORY'), requireFeature('CREDIT_NOTES')],
    },
    purchaseController.getSupplierCreditBalance,
  );
}

export default purchaseFastifyRoutes;
