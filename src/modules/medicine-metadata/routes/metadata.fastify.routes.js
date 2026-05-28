import metadataController from '../controllers/metadata.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

async function metadataRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  // --- Procurement Intelligence ---
  fastify.get(
    '/:id/suppliers',
    {
      schema: {
        tags: ['Medicines'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }
      }
    },
    metadataController.getSuppliers
  );

  fastify.post(
    '/:id/suppliers',
    {
      schema: {
        tags: ['Medicines'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['supplierId'],
          properties: {
            supplierId: { type: 'string', format: 'uuid' },
            isPreferred: { type: 'boolean', default: false },
            contractPrice: { type: 'number' },
            leadDays: { type: 'integer' }
          }
        }
      }
    },
    metadataController.addSupplier
  );

  // --- Operational Trends ---
  fastify.get(
    '/:id/purchase-history',
    {
      schema: {
        tags: ['Medicines'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }
      }
    },
    metadataController.getPurchaseHistory
  );

  fastify.get(
    '/:id/stock-history',
    {
      schema: {
        tags: ['Medicines'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }
      }
    },
    metadataController.getStockHistory
  );

  // --- Expiry Intelligence ---
  fastify.get(
    '/:id/expiry-history',
    {
      schema: {
        tags: ['Medicines'],
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } }
      }
    },
    metadataController.getExpiryHistory
  );
}

export default metadataRoutes;
