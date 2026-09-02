import checkoutController from './fastify/checkout.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/create-checkout', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Create payment session for subscription checkout',
      body: {
        type: 'object',
        required: ['planId'],
        properties: {
          planId: { type: 'string' },
        },
      },
    },
    preHandler: [requirePermission('MANAGE_SETTINGS')],
    handler: checkoutController.createCheckout,
  });

  fastify.get('/payment-status/:sessionId', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get payment session status',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
    handler: checkoutController.getPaymentStatus,
  });

  fastify.post('/verify-payment', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Verify payment and activate subscription',
      body: {
        type: 'object',
        required: [
          'paymentSessionId',
          'state',
          'razorpayPaymentId',
          'razorpayOrderId',
          'razorpaySignature',
        ],
        properties: {
          paymentSessionId: { type: 'string' },
          state: { type: 'string' },
          razorpayPaymentId: { type: 'string' },
          razorpayOrderId: { type: 'string' },
          razorpaySignature: { type: 'string' },
        },
      },
    },
    handler: checkoutController.verifyPayment,
  });

  fastify.post('/callback', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Handle payment callback with state validation',
      querystring: {
        type: 'object',
        required: ['sessionId', 'state'],
        properties: {
          sessionId: { type: 'string' },
          state: { type: 'string' },
        },
      },
    },
    handler: checkoutController.handleCallback,
  });
}
