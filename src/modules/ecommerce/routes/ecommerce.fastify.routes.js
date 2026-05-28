import controller from '../fastify/storefront.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.get('/storefront/:tenantId/catalog', {
    schema: { tags: ['Ecommerce'], summary: 'Get public catalog' },
    handler: controller.getCatalog,
  });

  fastify.post('/sync/reconcile', {
    schema: { tags: ['Ecommerce'], summary: 'Reconcile inventory' },
    preHandler: [authenticate, requireTenant],
    handler: controller.reconcile,
  });
}
