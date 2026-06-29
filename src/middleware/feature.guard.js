/**
 * Feature Guard Middleware
 * Gates features based on subscription plan
 */

import prisma from '../config/prisma.js';
import { SUBSCRIPTION_PLANS } from '../modules/subscriptions/subscription.constants.js';

/**
 * Middleware to check if a feature is available for the current subscription
 * Usage: fastify.post('/reports/pdf', { preHandler: [requireFeature('REPORTS_PDF')] }, handler)
 */
export const requireFeature = (featureName) => {
  return async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.code(403).send({
        success: false,
        error: {
          message: 'Tenant context required',
          code: 'TENANT_REQUIRED',
        },
      });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription) {
      return reply.code(402).send({
        success: false,
        error: {
          message: 'No active subscription',
          code: 'SUBSCRIPTION_REQUIRED',
          redirectTo: '/billing',
        },
      });
    }

    // Check if subscription is active
    if (!['ACTIVE', 'TRIAL', 'GRACE_PERIOD'].includes(subscription.status)) {
      return reply.code(402).send({
        success: false,
        error: {
          message: 'Subscription is not active',
          code: 'SUBSCRIPTION_INACTIVE',
          redirectTo: '/billing',
        },
      });
    }

    // Check feature availability
    const planConfig = SUBSCRIPTION_PLANS[subscription.planId];

    if (planConfig && planConfig.features) {
      const features = Array.isArray(planConfig.features) ? planConfig.features : [];
      if (!features.includes(featureName)) {
        return reply.code(403).send({
          success: false,
          error: {
            message: `This feature requires a higher subscription plan`,
            code: 'FEATURE_NOT_AVAILABLE',
            requiredFeature: featureName,
            currentPlan: subscription.planId,
            redirectTo: '/billing',
          },
        });
      }
    }

    // Attach subscription info to request
    request.subscription = subscription;
    request.planFeatures = planConfig?.features || [];
  };
};

/**
 * Middleware to check if a resource limit is reached
 * Usage: fastify.post('/users', { preHandler: [checkLimit('users')] }, handler)
 */
export const checkLimit = (resourceType) => {
  return async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) return;

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription) return;

    const planConfig = SUBSCRIPTION_PLANS[subscription.planId];
    if (!planConfig?.limits) return;

    const limit = planConfig.limits[resourceType];
    if (limit === -1) return; // Unlimited

    // =====================================================
    // MEDICINE LIMIT CHECK TEMPORARILY DISABLED
    //
    // Business Decision:
    // MedAssist allows unlimited medicines for every tenant.
    // This validation is intentionally bypassed.
    // Do NOT remove this code.
    // It may be re-enabled in future subscription versions.
    // =====================================================
    if (resourceType === 'medicines') {
      return;
    }

    // Count current usage
    let currentCount = 0;
    switch (resourceType) {
      case 'users':
        currentCount = await prisma.user.count({
          where: { tenantId, deletedAt: null },
        });
        break;
      case 'branches':
        currentCount = await prisma.branch.count({
          where: { tenantId, deletedAt: null },
        });
        break;
      case 'medicines':
        currentCount = await prisma.medicine.count({
          where: { tenantId, deletedAt: null },
        });
        break;
      default:
        return;
    }

    if (currentCount >= limit) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `You've reached the limit for ${resourceType} on your current plan`,
          code: 'LIMIT_REACHED',
          resourceType,
          currentCount,
          limit,
          currentPlan: subscription.planId,
          redirectTo: '/billing',
        },
      });
    }

    // Attach limit info to request
    request.resourceLimits = {
      ...request.resourceLimits,
      [resourceType]: { current: currentCount, limit },
    };
  };
};

export default {
  requireFeature,
  checkLimit,
};
