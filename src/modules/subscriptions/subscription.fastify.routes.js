import controller from './fastify/subscription.fastify.controller.js';
import trialController from './fastify/subscription-trial.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/status', {
    schema: { 
      tags: ['Subscriptions'], 
      summary: 'Get subscription status' 
    },
    handler: controller.getStatus
  });

  fastify.post('/', {
    schema: { 
      tags: ['Subscriptions'], 
      summary: 'Create subscription',
      body: {
        type: 'object',
        required: ['planId', 'billingCycle'],
        properties: {
          planId: { type: 'string' },
          billingCycle: { type: 'string', enum: ['monthly', 'annual'] }
        }
      }
    },
    handler: controller.createSubscription
  });

  fastify.post('/verify-trial', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Activate trial subscription'
    },
    handler: trialController.activateTrial
  });

  fastify.post('/activate', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Activate/reactivate subscription'
    },
    handler: controller.activateSubscription
  });

  fastify.post('/cancel', {
    schema: { 
      tags: ['Subscriptions'], 
      summary: 'Cancel subscription' 
    },
    handler: controller.cancelSubscription
  });
}
