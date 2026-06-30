import prisma from '../config/prisma.js';
import logger from '../shared/utils/logger.js';

const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/payments',
  '/api/subscriptions',
  '/health',
  '/api-docs',
];

const ALLOWED_WHEN_EXPIRED = [
  '/api/subscriptions',
  '/api/users/profile',
  '/api/support',
  '/api/auth/logout',
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
    let status = subscription.status;

    if (status === 'TRIAL') {
      const expiryDate = subscription.trialExpiresAt || subscription.endDate;
      if (expiryDate && expiryDate < now) {
        status = 'EXPIRED';
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
      }
    } else if (status === 'ACTIVE') {
      if (subscription.endDate && subscription.endDate < now) {
        if (!subscription.graceEndDate || subscription.graceEndDate < now) {
          status = 'EXPIRED';
          await prisma.subscription.update({
            where: { tenantId },
            data: { status: 'EXPIRED' },
          });
        } else {
          status = 'GRACE_PERIOD';
          await prisma.subscription.update({
            where: { tenantId },
            data: { status: 'GRACE_PERIOD' },
          });
        }
      }
    } else if (status === 'GRACE_PERIOD') {
      if (subscription.graceEndDate && subscription.graceEndDate < now) {
        status = 'EXPIRED';
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
      }
    }

    if (
      status === 'EXPIRED' ||
      status === 'SUSPENDED' ||
      status === 'CANCELLED'
    ) {
      const isAllowed = ALLOWED_WHEN_EXPIRED.some((p) => url.startsWith(p));
      if (!isAllowed) {
        return reply.code(403).send({
          success: false,
          error: {
            message: `Your subscription is ${status.toLowerCase()}. Please renew to continue.`,
            code: 'SUBSCRIPTION_EXPIRED',
            redirectTo: '/subscription',
          },
        });
      }
    }
  } catch (error) {
    logger.error(
      { tenantId: request.tenantId, error: error.message },
      '[SUBSCRIPTION GUARD] Error',
    );
  }
};
