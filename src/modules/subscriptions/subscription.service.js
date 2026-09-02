import prisma from '../../config/prisma.js';
import { TRIAL_PLAN_ID } from './subscription.constants.js';

class SubscriptionService {
  async createSubscription(tenantId, planId, billingCycle, performedBy = null, tx = null) {
    const client = tx || prisma;
    const plan = await client.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan || !plan.isActive) {
      throw new Error('The selected subscription plan is unavailable.');
    }

    const inputCycle = (plan.billingCycle || billingCycle || 'monthly').toString().toUpperCase();
    let finalBillingCycle = 'MONTHLY';
    if (inputCycle === 'YEARLY' || inputCycle === 'ANNUAL') finalBillingCycle = 'YEARLY';
    else if (inputCycle === 'QUARTERLY') finalBillingCycle = 'QUARTERLY';

    const startDate = new Date();
    const endDate = new Date(startDate);
    if (finalBillingCycle === 'YEARLY' || billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + 7);

    const existing = await client.subscription.findUnique({ where: { tenantId } });
    const oldStatus = existing?.status;
    const oldExpiry = existing?.endDate;

    const subscription = await client.subscription.upsert({
      where: { tenantId },
      update: {
        planId,
        status: 'ACTIVE',
        startDate,
        endDate,
        graceEndDate,
        autoRenew: true,
        isTrial: false,
        trialStartedAt: null,
        trialExpiresAt: null,
      },
      create: {
        tenantId,
        planId,
        status: 'ACTIVE',
        startDate,
        endDate,
        graceEndDate,
        autoRenew: true,
        isTrial: false,
      },
    });

    await this._logHistory(
      {
        tenantId,
        subscriptionId: subscription.id,
        action: 'SUBSCRIPTION_ACTIVATED',
        oldStatus,
        newStatus: 'ACTIVE',
        oldExpiry,
        newExpiry: endDate,
        performedBy,
        metadata: { planId, billingCycle },
      },
      client,
    );

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
        trialStartedAt: null,
        trialExpiresAt: null,
        daysRemaining: 0,
      };
    }

    const now = new Date();
    let status = subscription.status;

    if (
      (status === 'TRIAL' && subscription.trialExpiresAt && subscription.trialExpiresAt < now) ||
      (status === 'ACTIVE' && subscription.endDate && subscription.endDate < now)
    ) {
      if (status === 'TRIAL') {
        status = 'EXPIRED';
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
        await this._logHistory(
          {
            tenantId,
            subscriptionId: subscription.id,
            action: 'TRIAL_EXPIRED',
            oldStatus: 'TRIAL',
            newStatus: 'EXPIRED',
            oldExpiry: subscription.trialExpiresAt,
            newExpiry: subscription.trialExpiresAt,
            performedBy: null,
          },
          prisma,
        );
      } else if (!subscription.graceEndDate || subscription.graceEndDate < now) {
        status = 'EXPIRED';
        await prisma.subscription.update({
          where: { tenantId },
          data: { status: 'EXPIRED' },
        });
      }
    }

    const plan = subscription.plan;
    const endDate =
      status === 'TRIAL'
        ? subscription.trialExpiresAt || subscription.endDate
        : subscription.endDate;
    const daysRemaining = endDate
      ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      planId: plan?.id || null,
      planName: plan?.name || 'Unknown',
      price: plan?.price ?? 0,
      status,
      isTrial: status === 'TRIAL',
      isExpired: status === 'EXPIRED',
      expiresAt: endDate,
      trialStartedAt: subscription.trialStartedAt,
      trialExpiresAt: subscription.trialExpiresAt,
      daysRemaining,
    };
  }

  async cancelSubscription(tenantId, performedBy = null) {
    const existing = await prisma.subscription.findUnique({ where: { tenantId } });
    const subscription = await prisma.subscription.update({
      where: { tenantId },
      data: {
        status: 'CANCELLED',
        autoRenew: false,
      },
    });

    await this._logHistory({
      tenantId,
      subscriptionId: subscription.id,
      action: 'SUBSCRIPTION_CANCELLED',
      oldStatus: existing?.status,
      newStatus: 'CANCELLED',
      oldExpiry: existing?.endDate,
      newExpiry: null,
      performedBy,
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

    const trialPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: TRIAL_PLAN_ID },
    });
    if (!trialPlan || !trialPlan.isActive) {
      throw new Error('The free-trial plan is unavailable.');
    }
    const trialDays = trialPlan.trialDays ?? 0;

    const now = new Date();
    const trialExpiresAt = new Date(now);
    trialExpiresAt.setDate(trialExpiresAt.getDate() + trialDays);

    const subscription = await prisma.subscription.upsert({
      where: { tenantId },
      update: {
        planId: TRIAL_PLAN_ID,
        status: 'TRIAL',
        startDate: now,
        endDate: trialExpiresAt,
        graceEndDate: null,
        autoRenew: false,
        isTrial: true,
        trialDays,
        trialStartedAt: now,
        trialExpiresAt,
      },
      create: {
        tenantId,
        planId: TRIAL_PLAN_ID,
        status: 'TRIAL',
        startDate: now,
        endDate: trialExpiresAt,
        graceEndDate: null,
        autoRenew: false,
        isTrial: true,
        trialDays,
        trialStartedAt: now,
        trialExpiresAt,
      },
    });

    await this._logHistory({
      tenantId,
      subscriptionId: subscription.id,
      action: 'TRIAL_CREATED',
      oldStatus: existing?.status || null,
      newStatus: 'TRIAL',
      oldExpiry: null,
      newExpiry: trialExpiresAt,
      performedBy: null,
      metadata: { trialDays },
    });

    return subscription;
  }

  async extendTrial(tenantId, days, performedBy = null) {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status !== 'TRIAL') throw new Error('Can only extend active trials');

    const daysNum = parseInt(days) || 0;
    if (daysNum <= 0) throw new Error('Days must be positive');

    const currentExpiry = subscription.trialExpiresAt || subscription.endDate || new Date();
    const newExpiry = new Date(new Date(currentExpiry).getTime() + daysNum * 86400000);

    const updated = await prisma.subscription.update({
      where: { tenantId },
      data: {
        trialExpiresAt: newExpiry,
        endDate: newExpiry,
        trialDays: (subscription.trialDays || 0) + daysNum,
      },
    });

    await this._logHistory({
      tenantId,
      subscriptionId: subscription.id,
      action: 'TRIAL_EXTENDED',
      oldStatus: 'TRIAL',
      newStatus: 'TRIAL',
      oldExpiry: currentExpiry,
      newExpiry,
      performedBy,
      metadata: { daysAdded: daysNum },
    });

    return updated;
  }

  async reduceTrial(tenantId, days, performedBy = null) {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status !== 'TRIAL') throw new Error('Can only reduce active trials');

    const daysNum = parseInt(days) || 0;
    if (daysNum <= 0) throw new Error('Days must be positive');

    const currentExpiry = subscription.trialExpiresAt || subscription.endDate || new Date();
    const newExpiryMs = new Date(currentExpiry).getTime() - daysNum * 86400000;
    const now = new Date();
    const newExpiry = new Date(Math.max(newExpiryMs, now.getTime()));

    const newTrialDays = Math.max(0, (subscription.trialDays || 0) - daysNum);
    let newStatus = subscription.status;

    if (newExpiry <= now) {
      newStatus = 'EXPIRED';
    }

    const updated = await prisma.subscription.update({
      where: { tenantId },
      data: {
        trialExpiresAt: newExpiry,
        endDate: newExpiry,
        trialDays: newTrialDays,
        status: newStatus,
      },
    });

    await this._logHistory(
      {
        tenantId,
        subscriptionId: subscription.id,
        action: 'TRIAL_REDUCED',
        oldStatus: 'TRIAL',
        newStatus,
        oldExpiry: currentExpiry,
        newExpiry,
        performedBy,
        metadata: { daysRemoved: daysNum },
      },
      prisma,
    );

    return updated;
  }

  async getSubscriptionHistory(tenantId, limit = 50) {
    return prisma.subscriptionHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async _logHistory(
    {
      tenantId,
      subscriptionId,
      action,
      oldStatus,
      newStatus,
      oldExpiry,
      newExpiry,
      performedBy,
      reason,
      metadata,
    },
    client = prisma,
  ) {
    try {
      await client.subscriptionHistory.create({
        data: {
          tenantId,
          subscriptionId,
          action,
          oldStatus: oldStatus || null,
          newStatus: newStatus || null,
          oldExpiry: oldExpiry || null,
          newExpiry: newExpiry || null,
          performedBy: performedBy || null,
          reason: reason || null,
          metadata: metadata || null,
        },
      });
    } catch (err) {
      console.error('[SUBSCRIPTION_HISTORY] Failed to log:', err.message);
    }
  }
}

export default new SubscriptionService();
