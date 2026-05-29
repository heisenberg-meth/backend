import orderController from '../fastify/order.fastify.controller.js';
import deliveryController from '../fastify/delivery.fastify.controller.js';
import riderController from '../fastify/rider.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/orders', {
    schema: { tags: ['Delivery'], summary: 'Create delivery order' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: orderController.create,
  });

  fastify.patch('/orders/:id/status', {
    schema: { tags: ['Delivery'], summary: 'Update order status' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: orderController.updateStatus,
  });

  fastify.post('/riders', {
    schema: { tags: ['Delivery'], summary: 'Register rider' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: riderController.register,
  });

  fastify.get('/riders/available', {
    schema: { tags: ['Delivery'], summary: 'Get available riders' },
    handler: riderController.getAvailable,
  });

  fastify.patch('/deliveries/:id/status', {
    schema: { tags: ['Delivery'], summary: 'Update delivery status' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: deliveryController.updateStatus,
  });

  fastify.post('/deliveries/location', {
    schema: { tags: ['Delivery'], summary: 'Update rider location' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: deliveryController.updateLocation,
  });

  fastify.get('/orders/:id/tracking', {
    schema: { tags: ['Delivery'], summary: 'Get order tracking' },
    handler: deliveryController.getTracking,
  });
}
