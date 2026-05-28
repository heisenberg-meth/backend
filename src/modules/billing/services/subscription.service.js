import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SubscriptionService {
  /**
   * Activate a subscription following a successful payment
   */
  async activateSubscription(tenantId, providerPaymentId, details) {
    return await prisma.$transaction(async (tx) => {
        // 1. Record Payment
        const payment = await tx.payment.create({
          data: {
            tenantId,
            providerName: details.provider,
            providerPaymentId,
            amount: details.amount,
            paymentStatus: 'SUCCESS',
          },
        });

        // 2. Update Subscription Status
        await tx.subscription.update({
            where: { tenantId },
            data: { status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
        });

        logger.info({ tenantId, paymentId: payment.id }, '[SUBSCRIPTION_SERVICE] Subscription activated');
        return payment;
    });
  }
}

export default new SubscriptionService();
