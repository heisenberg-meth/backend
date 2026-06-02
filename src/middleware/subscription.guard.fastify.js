import prisma from '../config/prisma.js';
import logger from '../shared/utils/logger.js';

const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/payments',
  '/api/subscriptions',
  '/health',
  '/api-docs',
];

export const subscriptionGuard = async (request, reply) => {
  const url = request.url || '';
  if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return;

  const tenantId = request.tenantId;
  if (!tenantId) return;

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription) {
      return;
    }

    const now = new Date();
    let needsUpdate = false;

    if (
      (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE') &&
      subscription.endDate < now
    ) {
      if (
        subscription.status === 'TRIAL' ||
        !subscription.graceEndDate ||
        subscription.graceEndDate < now
      ) {
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
        return reply.code(403).send({
          success: false,
          error: {
            message: 'Your subscription has expired. Please renew to continue.',
            code: 'SUBSCRIPTION_EXPIRED',
            redirectTo: '/subscription',
          },
        });
      }
      if (subscription.graceEndDate >= now) {
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'GRACE_PERIOD' },
        });
        needsUpdate = true;
      }
    }

    if (subscription.status === 'GRACE_PERIOD') {
      if (subscription.graceEndDate && subscription.graceEndDate < now) {
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
        return reply.code(403).send({
          success: false,
          error: {
            message: 'Your grace period has ended. Please renew to continue.',
            code: 'SUBSCRIPTION_EXPIRED',
            redirectTo: '/subscription',
          },
        });
      }
    }

    if (
      subscription.status === 'EXPIRED' ||
      subscription.status === 'SUSPENDED' ||
      subscription.status === 'CANCELLED'
    ) {
      return reply.code(403).send({
        success: false,
        error: {
          message: `Your subscription is ${subscription.status.toLowerCase()}. Please renew to continue.`,
          code: 'SUBSCRIPTION_EXPIRED',
          redirectTo: '/subscription',
        },
      });
    }

    if (needsUpdate) {
      request.subscriptionStatus = 'GRACE_PERIOD';
    }
  } catch (error) {
    logger.error(
      { tenantId: request.tenantId, error: error.message },
      '[SUBSCRIPTION GUARD] Error',
    );
  }
};
