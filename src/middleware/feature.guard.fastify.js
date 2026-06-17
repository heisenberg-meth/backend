import prisma from '../config/prisma.js';
import { SUBSCRIPTION_PLANS } from '../modules/subscriptions/subscription.constants.js';
import logger from '../shared/utils/logger.js';

/**
 * Ensures the tenant has the specified feature in their current active plan.
 * Must be used AFTER subscriptionGuard or authGuard which sets request.tenantId.
 */
export const requireFeature = (featureName) => {
  return async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Authentication required', code: 'AUTH_REQUIRED' },
      });
    }

    try {
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });

      // If no subscription, assume FREE plan restrictions
      const planId = subscription?.planId || 'free';
      const planConfig = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS['free'];

      const hasFeature = planConfig.features && planConfig.features.includes(featureName);

      if (!hasFeature) {
        return reply.code(403).send({
          success: false,
          error: {
            message: `Your current plan (${planConfig.name}) does not support ${featureName}. Please upgrade.`,
            code: 'FEATURE_NOT_ALLOWED',
          },
        });
      }
    } catch (error) {
      logger.error({ tenantId, error: error.message }, '[FEATURE GUARD] Error verifying feature');
      return reply.code(500).send({
        success: false,
        error: { message: 'Failed to verify feature access', code: 'SERVER_ERROR' },
      });
    }
  };
};

/**
 * Ensures the tenant has not exceeded their plan limits before a creation action.
 * `limitKey` maps to keys in `limits` e.g., 'users', 'branches'.
 * `currentCountFn` is a function `(request) => Promise<number>` that resolves the current count.
 */
export const requireLimit = (limitKey, currentCountFn) => {
  return async (request, reply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.code(401).send({
        success: false,
        error: { message: 'Authentication required', code: 'AUTH_REQUIRED' },
      });
    }

    try {
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });

      const planId = subscription?.planId || 'free';
      const planConfig = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS['free'];
      const limit = planConfig.limits ? planConfig.limits[limitKey] : undefined;

      if (limit === undefined) {
        return; // No limit defined for this key
      }
      if (limit === -1) {
        return; // Unlimited
      }

      const currentCount = await currentCountFn(request);

      if (currentCount >= limit) {
        return reply.code(403).send({
          success: false,
          error: {
            message: `You have reached the maximum allowed ${limitKey} (${limit}) for your current plan (${planConfig.name}). Please upgrade.`,
            code: 'PLAN_LIMIT_REACHED',
          },
        });
      }
    } catch (error) {
      logger.error({ tenantId, error: error.message }, '[LIMIT GUARD] Error verifying limits');
      return reply.code(500).send({
        success: false,
        error: { message: 'Failed to verify plan limits', code: 'SERVER_ERROR' },
      });
    }
  };
};
