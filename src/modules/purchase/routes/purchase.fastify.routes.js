import purchaseController from '../fastify/purchase.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

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
}

export default purchaseFastifyRoutes;
