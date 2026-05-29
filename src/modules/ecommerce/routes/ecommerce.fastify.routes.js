import controller from '../fastify/storefront.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.get('/storefront/:tenantId/catalog', {
    schema: { tags: ['Ecommerce'], summary: 'Get public catalog' },
    handler: controller.getCatalog,
  });

  fastify.post('/sync/reconcile', {
    schema: { tags: ['Ecommerce'], summary: 'Reconcile inventory' },
    preHandler: [authenticate, requireTenant, requirePermission('VIEW_INVENTORY')],
    handler: controller.reconcile,
  });
}
