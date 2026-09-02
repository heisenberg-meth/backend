import prisma from '../config/prisma.js';
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

      let planConfig = subscription?.plan;
      if (!planConfig) {
        planConfig = await prisma.subscriptionPlan.findFirst({
          where: { id: 'free', isActive: true },
        });
      }

      const features = Array.isArray(planConfig?.features) ? planConfig.features : [];
      const hasFeature = features.includes(featureName);

      if (!hasFeature) {
        return reply.code(403).send({
          success: false,
          error: {
            message: `Your current plan (${planConfig?.name || 'Free'}) does not support ${featureName}. Please upgrade.`,
            code: 'FEATURE_NOT_ALLOWED',
          },
        });
      }
    } catch (error) {
      logger.error({ tenantId, error: error.message }, '[FEATURE GUARD] Error verifying feature');
      return reply.code(500).send({
        success: false,
        error: {
          message: 'Failed to verify feature access',
          code: 'SERVER_ERROR',
        },
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

      let planConfig = subscription?.plan;
      if (!planConfig) {
        planConfig = await prisma.subscriptionPlan.findFirst({
          where: { id: 'free', isActive: true },
        });
      }

      let limit;
      if (limitKey === 'users') limit = planConfig?.maxUsers;
      else if (limitKey === 'branches') limit = planConfig?.maxBranches;
      else if (limitKey === 'batches' || limitKey === 'medicines') limit = planConfig?.maxBatches;

      if (limit === undefined || limit === null) {
        return;
      }
      if (limit === -1) {
        return;
      }

      // =====================================================
      // MEDICINE LIMIT CHECK TEMPORARILY DISABLED
      //
      // Business Decision:
      // MedAssist allows unlimited medicines for every tenant.
      // This validation is intentionally bypassed.
      // Do NOT remove this code.
      // It may be re-enabled in future subscription versions.
      // =====================================================
      if (limitKey === 'medicines') {
        logger.info(
          { tenantId },
          '[LIMIT GUARD] Medicine limit validation skipped (Unlimited Inventory Policy)',
        );
        return;
      }

      const currentCount = await currentCountFn(request);

      if (currentCount >= limit) {
        const isOverLimit = currentCount > limit;
        const usageMessage = isOverLimit
          ? `Your account has ${currentCount} ${limitKey}, which exceeds your plan limit of ${limit}.`
          : `You have reached the maximum allowed ${limitKey} (${limit}) for your current plan.`;

        return reply.code(403).send({
          success: false,
          code: 'PLAN_LIMIT_REACHED',
          resource: limitKey.toUpperCase().replace(/S$/, ''),
          current: currentCount,
          limit: limit,
          remaining: Math.max(0, limit - currentCount),
          plan: planConfig.name,
          error: {
            message: `${usageMessage} Please upgrade your plan to create new ${limitKey}.`,
            code: 'PLAN_LIMIT_REACHED',
            currentUsage: currentCount,
            allowedLimit: limit,
            planName: planConfig.name,
            remaining: Math.max(0, limit - currentCount),
            upgradeRequired: true,
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
