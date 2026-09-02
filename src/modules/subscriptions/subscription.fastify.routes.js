import controller from './fastify/subscription.fastify.controller.js';
import trialController from './fastify/subscription-trial.fastify.controller.js';
import checkoutRoutes from './checkout.fastify.routes.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';
import prisma from '../../config/prisma.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/status', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get subscription status',
    },
    handler: controller.getStatus,
  });

  fastify.get('/current', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get current subscription with trial details',
    },
    handler: async (request, reply) => {
      try {
        const { default: subscriptionService } = await import('./subscription.service.js');
        const status = await subscriptionService.getSubscriptionStatus(request.tenantId);
        return reply.send({ success: true, data: status });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, message: 'Failed to fetch subscription' });
      }
    },
  });

  fastify.get('/usage', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Get current plan usage for all limits',
    },
    handler: async (request, reply) => {
      const tenantId = request.tenantId;

      try {
        const subscription = await prisma.subscription.findUnique({
          where: { tenantId },
          include: { plan: true },
        });

        let planConfig = subscription?.plan;
        if (!planConfig) {
          planConfig = await prisma.subscriptionPlan.findFirst({
            where: { id: 'free', isActive: true },
          });
        }
        const planId = planConfig?.id || 'free';
        const limits = {
          medicines: planConfig?.maxBatches ?? -1,
          users: planConfig?.maxUsers ?? -1,
          branches: planConfig?.maxBranches ?? -1,
        };

        const [medicineCount, userCount, branchCount] = await Promise.all([
          prisma.medicine.count({ where: { tenantId, deletedAt: null } }),
          prisma.user.count({ where: { tenantId } }),
          prisma.branch.count({ where: { tenantId } }),
        ]);

        const usage = {
          plan: {
            id: planId,
            name: planConfig?.name || 'Free',
          },
          limits: {
            medicines: {
              current: medicineCount,
              limit: limits.medicines ?? -1,
              unlimited: limits.medicines === -1,
              exceeded:
                limits.medicines !== -1 &&
                limits.medicines !== undefined &&
                medicineCount > limits.medicines,
            },
            users: {
              current: userCount,
              limit: limits.users ?? -1,
              unlimited: limits.users === -1,
              exceeded:
                limits.users !== -1 && limits.users !== undefined && userCount > limits.users,
            },
            branches: {
              current: branchCount,
              limit: limits.branches ?? -1,
              unlimited: limits.branches === -1,
              exceeded:
                limits.branches !== -1 &&
                limits.branches !== undefined &&
                branchCount > limits.branches,
            },
          },
        };

        return reply.send({ success: true, data: usage });
      } catch {
        return reply.code(500).send({ success: false, error: 'Failed to fetch usage' });
      }
    },
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
          billingCycle: { type: 'string', enum: ['monthly', 'annual'] },
        },
      },
    },
    preHandler: [requirePermission('MANAGE_SETTINGS')],
    handler: controller.createSubscription,
  });

  fastify.post('/verify-trial', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Activate trial subscription',
    },
    preHandler: [requirePermission('MANAGE_SETTINGS')],
    handler: trialController.activateTrial,
  });

  fastify.post('/activate', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Activate/reactivate subscription',
    },
    preHandler: [requirePermission('MANAGE_SETTINGS')],
    handler: controller.activateSubscription,
  });

  fastify.post('/cancel', {
    schema: {
      tags: ['Subscriptions'],
      summary: 'Cancel subscription',
    },
    preHandler: [requirePermission('MANAGE_SETTINGS')],
    handler: controller.cancelSubscription,
  });

  fastify.register(checkoutRoutes, { prefix: '/checkout' });
}
