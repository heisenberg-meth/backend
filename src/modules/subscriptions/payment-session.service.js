import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import logger from '../../shared/utils/logger.js';
import { getConfig } from '../../config/payment.config.js';
import razorpay from '../../config/razorpay.js';
import subscriptionService from './subscription.service.js';
import paymentSessionAuditService from './payment-session-audit.service.js';
import { mainQueue } from '../../queue/index.js';

const SESSION_EXPIRY_MINUTES = 30;

class PaymentSessionService {
  async createCheckoutSession(tenantId, userId, planId) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    if (!plan.isActive) {
      throw new Error('The selected subscription plan is unavailable.');
    }

    const billingCycle = plan.billingCycle ? plan.billingCycle.toString().toLowerCase() : 'monthly';
    const amount = Number(plan.price);
    const currency = plan.currency || 'INR';

    const paymentSessionId = crypto.randomUUID();
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + SESSION_EXPIRY_MINUTES);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency,
      receipt: `sub_${paymentSessionId.slice(0, 8)}`,
      payment_capture: 1,
      notes: {
        type: 'SUBSCRIPTION_UPGRADE',
        tenantId,
        userId,
        planId,
        billingCycle,
        paymentSessionId,
      },
    });

    await prisma.paymentSession.create({
      data: {
        paymentSessionId,
        tenantId,
        userId,
        subscriptionPlanId: planId,
        amount,
        currency,
        state,
        status: 'PENDING',
        razorpayOrderId: razorpayOrder.id,
        expiresAt,
      },
    });

    logger.info(
      {
        paymentSessionId,
        tenantId,
        planId,
        amount,
        currency,
        razorpayOrderId: razorpayOrder.id,
      },
      '[PAYMENT_SESSION] Checkout session created',
    );

    await paymentSessionAuditService.logCheckoutCreated({
      tenantId,
      userId,
      paymentSessionId,
      planId,
      amount,
      currency,
    });

    return {
      paymentSessionId,
      state,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      expiresAt,
    };
  }

  async validateSession(paymentSessionId, state) {
    const session = await prisma.paymentSession.findUnique({
      where: { paymentSessionId },
    });

    if (!session) {
      throw new Error('Payment session not found');
    }

    if (session.state !== state) {
      logger.warn({ paymentSessionId, providedState: state }, '[PAYMENT_SESSION] State mismatch');
      await paymentSessionAuditService.logStateMismatch({
        tenantId: session.tenantId,
        paymentSessionId,
        providedState: state,
      });
      throw new Error('Invalid state parameter');
    }

    if (new Date() > session.expiresAt) {
      await this._updateSessionStatus(session.id, 'PAYMENT_EXPIRED');
      await paymentSessionAuditService.logPaymentExpired({
        tenantId: session.tenantId,
        userId: session.userId,
        paymentSessionId,
      });
      throw new Error('Payment session expired');
    }

    if (session.status !== 'PENDING' && session.status !== 'CHECKOUT_OPENED') {
      throw new Error(`Payment session already processed: ${session.status}`);
    }

    return session;
  }

  async verifyPayment(
    paymentSessionId,
    state,
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
  ) {
    const session = await this.validateSession(paymentSessionId, state);

    if (session.razorpayOrderId !== razorpayOrderId) {
      await this._updateSessionStatus(session.id, 'PAYMENT_FAILED', {
        razorpayPaymentId,
      });
      await paymentSessionAuditService.logSignatureVerificationFailed({
        tenantId: session.tenantId,
        paymentSessionId,
        razorpayOrderId,
      });
      throw new Error('Razorpay order ID mismatch');
    }

    if (!razorpaySignature || !/^[a-f0-9]{64}$/i.test(razorpaySignature)) {
      await this._updateSessionStatus(session.id, 'PAYMENT_FAILED', {
        razorpayPaymentId,
      });
      throw new Error('Invalid payment signature');
    }

    const config = getConfig();
    const secret = config.keySecret;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${session.razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const signatureValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(razorpaySignature, 'utf8'),
    );

    if (!signatureValid) {
      await this._updateSessionStatus(session.id, 'PAYMENT_FAILED', {
        razorpayPaymentId,
        razorpaySignature,
      });
      await paymentSessionAuditService.logSignatureVerificationFailed({
        tenantId: session.tenantId,
        paymentSessionId,
        razorpayOrderId,
      });
      throw new Error('Payment signature verification failed');
    }

    await this._updateSessionStatus(session.id, 'PAYMENT_SUCCESS', {
      razorpayPaymentId,
      razorpaySignature,
    });

    await paymentSessionAuditService.logPaymentSuccess({
      tenantId: session.tenantId,
      userId: session.userId,
      paymentSessionId,
      razorpayPaymentId,
      amount: session.amount,
    });

    await this._activateSubscription(session);

    return {
      success: true,
      status: 'SUBSCRIPTION_ACTIVATED',
      paymentSessionId,
    };
  }

  async handleWebhook(razorpayOrderId, razorpayPaymentId, event) {
    const session = await prisma.paymentSession.findFirst({
      where: { razorpayOrderId },
    });

    if (!session) {
      logger.warn({ razorpayOrderId }, '[PAYMENT_SESSION] No session found for webhook');
      return null;
    }

    if (session.status === 'SUBSCRIPTION_ACTIVATED') {
      logger.info({ razorpayOrderId }, '[PAYMENT_SESSION] Already activated');
      return session;
    }

    await paymentSessionAuditService.logWebhookReceived({
      tenantId: session.tenantId,
      paymentSessionId: session.paymentSessionId,
      event,
      razorpayOrderId,
    });

    switch (event) {
      case 'payment.captured':
      case 'order.paid':
        await this._updateSessionStatus(session.id, 'WEBHOOK_VERIFIED', {
          razorpayPaymentId,
        });
        await this._activateSubscription(session);
        break;
      case 'payment.failed':
        await this._updateSessionStatus(session.id, 'PAYMENT_FAILED', {
          razorpayPaymentId,
        });
        await paymentSessionAuditService.logPaymentFailed({
          tenantId: session.tenantId,
          userId: session.userId,
          paymentSessionId: session.paymentSessionId,
          reason: 'Webhook payment.failed',
        });
        break;
      default:
        logger.info({ event }, '[PAYMENT_SESSION] Unhandled webhook event');
    }

    return session;
  }

  async getPaymentStatus(paymentSessionId) {
    const session = await prisma.paymentSession.findUnique({
      where: { paymentSessionId },
      include: {
        subscriptionPlan: true,
      },
    });

    if (!session) {
      throw new Error('Payment session not found');
    }

    return {
      paymentSessionId: session.paymentSessionId,
      status: session.status,
      amount: session.amount,
      currency: session.currency,
      planName: session.subscriptionPlan.name,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }

  async _updateSessionStatus(sessionId, status, extra = {}) {
    const updateData = { status, ...extra };

    const session = await prisma.paymentSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    logger.info(
      { sessionId: session.paymentSessionId, from: session.status, to: status },
      '[PAYMENT_SESSION] Status updated',
    );

    return session;
  }

  async _activateSubscription(session) {
    try {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: session.subscriptionPlanId },
      });

      if (!plan || !plan.isActive) {
        throw new Error('Subscription plan is unavailable.');
      }

      const billingCycle = plan.billingCycle
        ? plan.billingCycle.toString().toLowerCase()
        : 'monthly';

      await subscriptionService.createSubscription(
        session.tenantId,
        plan.id,
        billingCycle,
        null,
        prisma,
      );

      await this._updateSessionStatus(session.id, 'SUBSCRIPTION_ACTIVATED');

      await paymentSessionAuditService.logSubscriptionActivated({
        tenantId: session.tenantId,
        userId: session.userId,
        paymentSessionId: session.paymentSessionId,
        planId: plan.id,
      });

      logger.info(
        {
          paymentSessionId: session.paymentSessionId,
          tenantId: session.tenantId,
          planId: plan.id,
        },
        '[PAYMENT_SESSION] Subscription activated',
      );
    } catch (error) {
      logger.error(
        {
          paymentSessionId: session.paymentSessionId,
          tenantId: session.tenantId,
          error: error.message,
        },
        '[PAYMENT_SESSION] Subscription activation failed',
      );

      await mainQueue.add(
        'activate-subscription-retry',
        {
          tenantId: session.tenantId,
          planId: session.subscriptionPlanId,
          paymentSessionId: session.paymentSessionId,
          attempt: 1,
        },
        { attempts: 5, backoff: { type: 'exponential', delay: 30000 } },
      );
    }
  }

  async cleanupExpiredSessions() {
    const expiredSessions = await prisma.paymentSession.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
    });

    for (const session of expiredSessions) {
      await this._updateSessionStatus(session.id, 'PAYMENT_EXPIRED');
    }

    logger.info({ count: expiredSessions.length }, '[PAYMENT_SESSION] Cleaned up expired sessions');

    return expiredSessions.length;
  }
}

export default new PaymentSessionService();
