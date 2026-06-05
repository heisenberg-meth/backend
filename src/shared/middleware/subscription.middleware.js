import prisma from '../../config/prisma.js';

export const requireActiveSubscription = async (request, reply) => {
  if (!request.tenantId) {
    return reply.code(403).send({ success: false, message: 'Tenant context required' });
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: request.tenantId },
  });

  if (!subscription) {
    return reply.code(402).send({
      success: false,
      message: 'No active subscription. Please set up billing.',
      code: 'SUBSCRIPTION_REQUIRED',
      redirectTo: '/billing',
    });
  }

  if (
    subscription.status === 'TRIAL' &&
    subscription.endDate &&
    new Date() > subscription.endDate
  ) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED' },
    });
    subscription.status = 'EXPIRED';
  }

  if (subscription.status === 'EXPIRED') {
    return reply.code(402).send({
      success: false,
      message: 'Your trial has expired. Please upgrade to continue.',
      code: 'SUBSCRIPTION_EXPIRED',
      redirectTo: '/billing',
    });
  }

  if (subscription.status === 'CANCELLED' || subscription.status === 'SUSPENDED') {
    return reply.code(402).send({
      success: false,
      message: 'Your subscription is inactive. Please contact support.',
      code: 'SUBSCRIPTION_INACTIVE',
      redirectTo: '/billing',
    });
  }
};
