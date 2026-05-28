import controller from '../fastify/manufacturer.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', {
    schema: { tags: ['Manufacturers'], summary: 'List manufacturers' },
    handler: controller.getManufacturers,
  });

  fastify.get('/:id', {
    schema: { tags: ['Manufacturers'], summary: 'Get manufacturer by ID' },
    handler: controller.getManufacturerById,
  });

  fastify.post('/', {
    schema: { tags: ['Manufacturers'], summary: 'Create manufacturer' },
    handler: controller.createManufacturer,
  });

  fastify.put('/:id', {
    schema: { tags: ['Manufacturers'], summary: 'Update manufacturer' },
    handler: controller.updateManufacturer,
  });

  fastify.delete('/:id', {
    schema: { tags: ['Manufacturers'], summary: 'Delete manufacturer' },
    handler: controller.deleteManufacturer,
  });
}
