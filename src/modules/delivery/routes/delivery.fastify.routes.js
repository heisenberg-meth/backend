import orderController from '../fastify/order.fastify.controller.js';
import deliveryController from '../fastify/delivery.fastify.controller.js';
import riderController from '../fastify/rider.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/orders', {
    schema: { tags: ['Delivery'], summary: 'Create delivery order' },
    handler: orderController.create,
  });

  fastify.patch('/orders/:id/status', {
    schema: { tags: ['Delivery'], summary: 'Update order status' },
    handler: orderController.updateStatus,
  });

  fastify.post('/riders', {
    schema: { tags: ['Delivery'], summary: 'Register rider' },
    handler: riderController.register,
  });

  fastify.get('/riders/available', {
    schema: { tags: ['Delivery'], summary: 'Get available riders' },
    handler: riderController.getAvailable,
  });

  fastify.patch('/deliveries/:id/status', {
    schema: { tags: ['Delivery'], summary: 'Update delivery status' },
    handler: deliveryController.updateStatus,
  });

  fastify.post('/deliveries/location', {
    schema: { tags: ['Delivery'], summary: 'Update rider location' },
    handler: deliveryController.updateLocation,
  });

  fastify.get('/orders/:id/tracking', {
    schema: { tags: ['Delivery'], summary: 'Get order tracking' },
    handler: deliveryController.getTracking,
  });
}
