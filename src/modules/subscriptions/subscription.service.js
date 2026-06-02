import prisma from '../../config/prisma.js';
import { TRIAL_DAYS, SUBSCRIPTION_PLANS, TRIAL_PLAN_ID } from './subscription.constants.js';

class SubscriptionService {
  async createSubscription(tenantId, planId, billingCycle, tx = null) {
    const client = tx || prisma;
    let plan = await client.subscriptionPlan.findUnique({ where: { id: planId } });

    if (!plan) {
      plan = await client.subscriptionPlan.create({
        data: {
          id: planId,
          name: SUBSCRIPTION_PLANS[planId]?.name || `${planId} Plan`,
          price: SUBSCRIPTION_PLANS[planId]?.price ?? 0,
          billingCycle: SUBSCRIPTION_PLANS[planId]?.billingCycle || billingCycle,
          features: SUBSCRIPTION_PLANS[planId]?.features || ['All Features Included'],
        },
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    if (billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + 7); // 7 days grace period

    const subscription = await client.subscription.upsert({
      where: { tenantId },
      update: {
        planId,
        status: 'ACTIVE',
        startDate,
        endDate,
        graceEndDate,
        autoRenew: true,
      },
      create: {
        tenantId,
        planId,
        status: 'ACTIVE',
        startDate,
        endDate,
        graceEndDate,
        autoRenew: true,
      },
    });

    return subscription;
  }

  async getSubscriptionStatus(tenantId) {
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });

    if (!subscription) {
      return {
        planId: null,
        planName: 'No Plan',
        price: 0,
        status: 'PENDING',
        isTrial: false,
        isExpired: false,
        expiresAt: null,
        daysRemaining: 0,
      };
    }

    const plan = subscription.plan;
    const endDate = subscription.endDate;
    const daysRemaining = endDate
      ? Math.max(0, Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      planId: plan?.id || null,
      planName: plan?.name || 'Unknown',
      price: plan?.price ?? 0,
      status: subscription.status,
      isTrial: subscription.status === 'TRIAL',
      isExpired: subscription.status === 'EXPIRED',
      expiresAt: endDate,
      daysRemaining,
    };
  }

  async cancelSubscription(tenantId) {
    const subscription = await prisma.subscription.update({
      where: { tenantId },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
      },
    });
    return subscription;
  }

  async activateSubscription(tenantId) {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) {
      return this.activateTrial(tenantId);
    }
    await prisma.subscription.update({
      where: { tenantId },
      data: { status: 'ACTIVE' },
    });
    return this.getSubscriptionStatus(tenantId);
  }

  async activateTrial(tenantId) {
    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    if (existing && existing.status !== 'EXPIRED' && existing.status !== 'CANCELLED') {
      throw new Error('Trial already used');
    }

    await prisma.subscriptionPlan.upsert({
      where: { id: TRIAL_PLAN_ID },
      update: {},
      create: {
        id: TRIAL_PLAN_ID,
        name: SUBSCRIPTION_PLANS[TRIAL_PLAN_ID]?.name || 'Free Trial',
        price: SUBSCRIPTION_PLANS[TRIAL_PLAN_ID]?.price ?? 0,
        billingCycle: 'MONTHLY',
        features: SUBSCRIPTION_PLANS[TRIAL_PLAN_ID]?.features || ['Free trial'],
      },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + TRIAL_DAYS);

    const subscription = await prisma.subscription.upsert({
      where: { tenantId },
      update: {
        planId: TRIAL_PLAN_ID,
        status: 'TRIAL',
        startDate,
        endDate,
        graceEndDate: null,
        autoRenew: false,
      },
      create: {
        tenantId,
        planId: TRIAL_PLAN_ID,
        status: 'TRIAL',
        startDate,
        endDate,
        graceEndDate: null,
        autoRenew: false,
      },
    });

    return subscription;
  }
}

export default new SubscriptionService();
