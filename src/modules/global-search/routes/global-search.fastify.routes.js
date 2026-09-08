import globalSearchController from '../controllers/global-search.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

async function globalSearchFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get(
    '/global',
    {
      schema: {
        tags: ['Search'],
        summary: 'Unified global search across entities and navigation',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            category: { type: 'string', default: 'All' },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
    },
    globalSearchController.search,
  );
}

export default globalSearchFastifyRoutes;
