import prisma from '../../config/prisma.js';
import logger from '../../shared/utils/logger.js';

class PaymentSessionAuditService {
  async logCheckoutCreated(data) {
    const { tenantId, userId, paymentSessionId, planId, amount, currency } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'CHECKOUT_CREATED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: {
        paymentSessionId,
        planId,
        amount,
        currency,
      },
    });

    logger.info(
      { tenantId, paymentSessionId, planId, amount },
      '[AUDIT] Checkout session created',
    );
  }

  async logCheckoutOpened(data) {
    const { tenantId, userId, paymentSessionId } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'CHECKOUT_OPENED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: { paymentSessionId },
    });
  }

  async logPaymentInitiated(data) {
    const { tenantId, userId, paymentSessionId, razorpayOrderId } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'PAYMENT_INITIATED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: {
        paymentSessionId,
        razorpayOrderId,
      },
    });
  }

  async logPaymentSuccess(data) {
    const { tenantId, userId, paymentSessionId, razorpayPaymentId, amount } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'PAYMENT_SUCCESS',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: {
        paymentSessionId,
        razorpayPaymentId,
        amount,
      },
    });

    logger.info(
      { tenantId, paymentSessionId, razorpayPaymentId, amount },
      '[AUDIT] Payment successful',
    );
  }

  async logPaymentFailed(data) {
    const { tenantId, userId, paymentSessionId, reason } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'PAYMENT_FAILED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: {
        paymentSessionId,
        reason,
      },
    });

    logger.warn(
      { tenantId, paymentSessionId, reason },
      '[AUDIT] Payment failed',
    );
  }

  async logPaymentExpired(data) {
    const { tenantId, userId, paymentSessionId } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'PAYMENT_EXPIRED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: { paymentSessionId },
    });
  }

  async logSubscriptionActivated(data) {
    const { tenantId, userId, paymentSessionId, planId } = data;

    await this._createAuditLog({
      tenantId,
      userId,
      action: 'SUBSCRIPTION_ACTIVATED',
      target: `payment-session:${paymentSessionId}`,
      type: 'SUBSCRIPTION',
      metadata: {
        paymentSessionId,
        planId,
      },
    });

    logger.info(
      { tenantId, paymentSessionId, planId },
      '[AUDIT] Subscription activated',
    );
  }

  async logWebhookReceived(data) {
    const { tenantId, paymentSessionId, event, razorpayOrderId } = data;

    await this._createAuditLog({
      tenantId,
      action: 'WEBHOOK_RECEIVED',
      target: `payment-session:${paymentSessionId}`,
      type: 'PAYMENT',
      metadata: {
        paymentSessionId,
        event,
        razorpayOrderId,
      },
    });
  }

  async logSignatureVerificationFailed(data) {
    const { tenantId, paymentSessionId, razorpayOrderId } = data;

    await this._createAuditLog({
      tenantId,
      action: 'SIGNATURE_VERIFICATION_FAILED',
      target: `payment-session:${paymentSessionId}`,
      type: 'SECURITY',
      metadata: {
        paymentSessionId,
        razorpayOrderId,
      },
    });

    logger.warn(
      { tenantId, paymentSessionId, razorpayOrderId },
      '[AUDIT] Signature verification failed - possible tampering',
    );
  }

  async logStateMismatch(data) {
    const { tenantId, paymentSessionId, providedState } = data;

    await this._createAuditLog({
      tenantId,
      action: 'STATE_MISMATCH',
      target: `payment-session:${paymentSessionId}`,
      type: 'SECURITY',
      metadata: {
        paymentSessionId,
        providedState,
      },
    });

    logger.warn(
      { tenantId, paymentSessionId },
      '[AUDIT] State parameter mismatch - possible callback tampering',
    );
  }

  async _createAuditLog(data) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId || null,
          action: data.action,
          target: data.target,
          type: data.type,
          date: new Date(),
        },
      });
    } catch (error) {
      logger.error(
        { error: error.message, data },
        '[AUDIT] Failed to create audit log',
      );
    }
  }
}

export default new PaymentSessionAuditService();
