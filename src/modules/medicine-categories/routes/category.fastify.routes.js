import controller from '../fastify/category.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: { tags: ['Categories'], summary: 'List categories' },
    handler: controller.getCategories,
  });

  fastify.get('/analytics', {
    schema: { tags: ['Categories'], summary: 'Get category analytics' },
    handler: controller.getCategoryAnalytics,
  });

  fastify.get('/:id', {
    schema: { tags: ['Categories'], summary: 'Get category by ID' },
    handler: controller.getCategoryById,
  });

  fastify.post('/', {
    schema: { tags: ['Categories'], summary: 'Create category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.createCategory,
  });

  fastify.put('/:id', {
    schema: { tags: ['Categories'], summary: 'Update category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.updateCategory,
  });

  fastify.delete('/:id', {
    schema: { tags: ['Categories'], summary: 'Delete category' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: controller.deleteCategory,
  });
}
