import searchService from '../services/medicine-search.service.js';
import medicineSearchRepository from '../repositories/medicine-search.repository.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

async function medicineSearchFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/search', {
    schema: {
      tags: ['Medicines'],
      summary: 'Search medicines',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          category: { type: 'string' },
          schedule: { type: 'string' },
          branchId: { type: 'string' },
          inStockOnly: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const result = await searchService.search(request.tenantId, request.query.q, {
      limit: parseInt(request.query.limit) || 20,
      category: request.query.category,
      schedule: request.query.schedule,
      branchId: request.query.branchId,
      inStockOnly: request.query.inStockOnly === 'true',
    });
    return reply.send({ success: true, data: result.results, meta: { count: result.results.length } });
  });

  fastify.get('/autocomplete', {
    schema: {
      tags: ['Medicines'],
      summary: 'Autocomplete medicine names',
      querystring: {
        type: 'object',
        properties: {
          prefix: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const result = await searchService.autocomplete(request.tenantId, request.query.prefix);
    return reply.send({ success: true, data: result.suggestions });
  });

  fastify.get('/barcode/:barcode', {
    schema: {
      tags: ['Medicines'],
      summary: 'Find medicine by barcode',
      params: {
        type: 'object',
        required: ['barcode'],
        properties: {
          barcode: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    let medicine = await medicineSearchRepository.findByBarcode(request.params.barcode, request.tenantId);
    if (!medicine) {
      medicine = await medicineSearchRepository.findByBarcodeMapping(request.params.barcode, request.tenantId);
    }
    if (!medicine) return reply.code(404).send({ success: false, message: 'Medicine not found' });

    const enriched = medicineSearchRepository.enrichWithInventory(medicine);
    return reply.send({ success: true, data: { medicine: enriched } });
  });

  fastify.get('/sku/:sku', {
    schema: {
      tags: ['Medicines'],
      summary: 'Find medicine by SKU',
      params: {
        type: 'object',
        required: ['sku'],
        properties: {
          sku: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const medicine = await medicineSearchRepository.findBySku(request.params.sku, request.tenantId);
    if (!medicine) return reply.code(404).send({ success: false, message: 'Medicine not found' });
    const enriched = medicineSearchRepository.enrichWithInventory(medicine);
    return reply.send({ success: true, data: { medicine: enriched } });
  });

  fastify.get('/:id/alternatives', {
    schema: {
      tags: ['Medicines'],
      summary: 'Get medicine alternatives',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const alternatives = await searchService.getAlternatives(request.params.id, request.tenantId);
    return reply.send({ success: true, data: alternatives });
  });

  fastify.get('/:id/availability', {
    schema: {
      tags: ['Medicines'],
      summary: 'Get medicine availability',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const availability = await searchService.getAvailability(request.params.id, request.tenantId);
    return reply.send({ success: true, data: availability });
  });

  fastify.get('/popular-searches', {
    schema: {
      tags: ['Medicines'],
      summary: 'Get popular medicine searches',
    },
  }, async (request, reply) => {
    const searches = await searchService.getPopularSearches(request.tenantId);
    return reply.send({ success: true, data: searches });
  });
}

export default medicineSearchFastifyRoutes;
