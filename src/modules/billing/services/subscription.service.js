import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SubscriptionService {
  async activateSubscription(tenantId, providerPaymentId, details) {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          transactionId: providerPaymentId,
          razorpayPaymentId: providerPaymentId,
          amount: details.amount,
          status: 'SUCCESS',
          paymentProvider: details.provider || 'RAZORPAY',
        },
      });

      await tx.subscription.update({
        where: { tenantId },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      logger.info(
        { tenantId, paymentId: payment.id },
        '[SUBSCRIPTION_SERVICE] Subscription activated',
      );
      return payment;
    });
  }
}

export default new SubscriptionService();
