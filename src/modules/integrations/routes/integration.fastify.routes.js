import integrationController from '../controllers/integration.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function integrationRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/integrations',
    {
      preHandler: [requirePermission('settings.integrations.read')],
    },
    integrationController.getSettings,
  );

  fastify.put(
    '/integrations',
    {
      preHandler: [requirePermission('settings.integrations.update')],
    },
    integrationController.updateSettings,
  );

  fastify.post(
    '/integrations/test',
    {
      preHandler: [requirePermission('providers.manage')],
    },
    integrationController.testProvider,
  );

  fastify.get(
    '/integrations/health',
    {
      preHandler: [requirePermission('settings.integrations.read')],
    },
    integrationController.getHealth,
  );
}
