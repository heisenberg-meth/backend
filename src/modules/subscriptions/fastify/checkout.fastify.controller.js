import paymentSessionService from '../payment-session.service.js';
import logger from '../../../shared/utils/logger.js';

const formatStatusResponse = (statusObj) => {
  if (!statusObj) return { success: false, paymentStatus: 'PENDING' };

  const statusMap = {
    SUCCESS: 'SUCCESS',
    PAYMENT_SUCCESS: 'SUCCESS',
    SUBSCRIPTION_ACTIVATED: 'SUCCESS',
    WEBHOOK_VERIFIED: 'SUCCESS',
    CAPTURED: 'SUCCESS',
    FAILED: 'FAILED',
    PAYMENT_FAILED: 'FAILED',
    PENDING: 'PENDING',
    CREATED: 'PENDING',
    CHECKOUT_OPENED: 'PENDING',
    AUTHORIZED: 'PENDING',
    EXPIRED: 'TIMEOUT',
    PAYMENT_EXPIRED: 'TIMEOUT',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
  };

  const paymentStatus = statusMap[statusObj.status] || 'PENDING';
  const plan = statusObj.planName || 'Professional';

  if (paymentStatus === 'SUCCESS') {
    return {
      success: true,
      paymentStatus: 'SUCCESS',
      subscriptionActive: true,
      plan: plan,
      data: statusObj,
    };
  } else if (paymentStatus === 'FAILED') {
    return {
      success: false,
      paymentStatus: 'FAILED',
      reason: statusObj.failureReason || 'Payment failed',
    };
  } else if (paymentStatus === 'TIMEOUT' || paymentStatus === 'CANCELLED') {
    return {
      success: false,
      paymentStatus: paymentStatus,
    };
  }

  return {
    success: false,
    paymentStatus: 'PENDING',
  };
};

class CheckoutController {
  async createCheckout(request, reply) {
    try {
      const { planId, billingCycle } = request.body;
      const tenantId = request.tenantId;
      const userId = request.user.id;

      const session = await paymentSessionService.createCheckoutSession(
        tenantId,
        userId,
        planId,
        billingCycle,
      );

      return reply.code(201).send({
        success: true,
        data: session,
      });
    } catch (error) {
      logger.error(
        { error: error.message, tenantId: request.tenantId },
        '[CHECKOUT] Failed to create checkout session',
      );

      return reply.code(400).send({
        success: false,
        error: error.message,
      });
    }
  }

  async getPaymentStatus(request, reply) {
    try {
      const { sessionId } = request.params;

      const status = await paymentSessionService.getPaymentStatus(sessionId);

      return reply.send(formatStatusResponse(status));
    } catch (error) {
      logger.error(
        { error: error.message, sessionId: request.params.sessionId },
        '[CHECKOUT] Failed to get payment status',
      );

      return reply.code(404).send({
        success: false,
        paymentStatus: 'PENDING',
        error: error.message,
      });
    }
  }

  async verifyPayment(request, reply) {
    try {
      const { paymentSessionId, state, razorpayPaymentId, razorpayOrderId, razorpaySignature } =
        request.body;

      const result = await paymentSessionService.verifyPayment(
        paymentSessionId,
        state,
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      );

      return reply.send({
        success: true,
        paymentStatus: 'SUCCESS',
        subscriptionActive: true,
        plan: 'Professional',
        data: result,
      });
    } catch (error) {
      logger.error(
        { error: error.message, paymentSessionId: request.body.paymentSessionId },
        '[CHECKOUT] Payment verification failed',
      );

      return reply.code(400).send({
        success: false,
        error: error.message,
      });
    }
  }

  async handleCallback(request, reply) {
    try {
      const { sessionId, state } = request.query;

      const session = await paymentSessionService.validateSession(sessionId, state);

      return reply.send({
        success: true,
        data: {
          paymentSessionId: session.paymentSessionId,
          status: session.status,
          amount: session.amount,
        },
      });
    } catch (error) {
      logger.error(
        { error: error.message, sessionId: request.query.sessionId },
        '[CHECKOUT] Callback validation failed',
      );

      return reply.code(400).send({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new CheckoutController();
