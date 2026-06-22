import paymentSessionService from '../payment-session.service.js';
import logger from '../../../shared/utils/logger.js';

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

      return reply.send({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error(
        { error: error.message, sessionId: request.params.sessionId },
        '[CHECKOUT] Failed to get payment status',
      );

      return reply.code(404).send({
        success: false,
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
