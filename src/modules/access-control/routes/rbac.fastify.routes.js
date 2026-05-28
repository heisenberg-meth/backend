import controller from '../fastify/role.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/roles', {
    schema: { tags: ['RBAC'], summary: 'List roles' },
    preHandler: [requirePermission('MANAGE_ROLES')],
    handler: controller.getRoles,
  });

  fastify.post('/roles', {
    schema: { tags: ['RBAC'], summary: 'Create role' },
    preHandler: [requirePermission('MANAGE_ROLES')],
    handler: controller.createRole,
  });

  fastify.get('/roles/:id', {
    schema: { tags: ['RBAC'], summary: 'Get role by ID' },
    preHandler: [requirePermission('MANAGE_ROLES')],
    handler: controller.getRoleById,
  });

  fastify.put('/roles/:id', {
    schema: { tags: ['RBAC'], summary: 'Update role' },
    preHandler: [requirePermission('MANAGE_ROLES')],
    handler: controller.updateRole,
  });

  fastify.get('/permissions', {
    schema: { tags: ['RBAC'], summary: 'List permissions' },
    preHandler: [requirePermission('MANAGE_ROLES')],
    handler: controller.getPermissions,
  });

  fastify.post('/permissions/seed', {
    schema: { tags: ['RBAC'], summary: 'Seed default permissions' },
    handler: controller.seedPermissions,
  });
}
