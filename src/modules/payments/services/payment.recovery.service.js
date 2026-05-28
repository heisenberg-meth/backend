import prisma from '../../../config/prisma.js';
import razorpay from '../../../config/razorpay.js';
import logger from '../../../shared/utils/logger.js';
import paymentStateMachine, { VALID_STATES } from './payment.state-machine.js';
import paymentOrchestratorService from './payment.orchestrator.service.js';
import paymentLockService from './payment.lock.service.js';

class PaymentRecoveryService {
  async recoverOrphanedPayments(tenantId = null) {
    const threshold = new Date(Date.now() - 30 * 60 * 1000);
    const where = {
      status: { in: [VALID_STATES.CREATED, VALID_STATES.INITIATED, VALID_STATES.PENDING, VALID_STATES.RECOVERY_PENDING] },
      createdAt: { lt: threshold },
      ...(tenantId ? { tenantId } : {}),
    };

    const orphans = await prisma.payment.findMany({ where });
    logger.info({ count: orphans.length }, '[RECOVERY] Found orphaned payments');

    const results = { recovered: 0, failed: 0, skipped: 0 };

    for (const payment of orphans) {
      try {
        await paymentLockService.executeWithLock(
          `recovery:${payment.id}`,
          async () => {
            const current = await prisma.payment.findUnique({ where: { id: payment.id } });
            if (!current || !paymentStateMachine.isRecoverable(current.status)) {
              results.skipped++;
              return;
            }

            const razorpayOrder = await razorpay.orders.fetch(payment.razorpayOrderId);
            const gatewayStatus = razorpayOrder.status;

            if (gatewayStatus === 'paid' || gatewayStatus === 'captured') {
              const payments = await razorpay.payments.all({ order_id: payment.razorpayOrderId });
              const capturedPayment = payments.items?.find(p => p.status === 'captured');
              if (capturedPayment) {
                await paymentOrchestratorService._transitionPayment(payment.id, VALID_STATES.CAPTURED, {
                  razorpayPaymentId: capturedPayment.id,
                  paidAt: new Date(capturedPayment.created_at * 1000),
                });
                await paymentOrchestratorService._transitionPayment(payment.id, VALID_STATES.SUCCESS, {});
                results.recovered++;
                logger.info({ paymentId: payment.id, orderId: payment.razorpayOrderId }, '[RECOVERY] Orphan recovered');
                return;
              }
            }

            if (gatewayStatus === 'failed' || gatewayStatus === 'cancelled') {
              await paymentOrchestratorService._transitionPayment(payment.id, VALID_STATES.FAILED, {
                failureReason: `Gateway status: ${gatewayStatus}`,
              });
              results.failed++;
            } else if (gatewayStatus === 'created' || gatewayStatus === 'attempted') {
              await paymentOrchestratorService._transitionPayment(payment.id, VALID_STATES.PENDING, {});
            }
          },
          10000
        );
      } catch (error) {
        if (error.message?.includes('Resource locked')) {
          results.skipped++;
        } else {
          logger.error({ error, paymentId: payment.id }, '[RECOVERY] Orphan recovery error');
          results.failed++;
        }
      }
    }

    return results;
  }

  async detectStuckPayments() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stuck = await prisma.payment.findMany({
      where: {
        status: VALID_STATES.PENDING,
        createdAt: { lt: oneHourAgo },
        razorpayPaymentId: null,
      },
    });

    for (const payment of stuck) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: VALID_STATES.EXPIRED },
      });

      await prisma.paymentAuditLog.create({
        data: {
          paymentId: payment.id,
          tenantId: payment.tenantId,
          fromStatus: VALID_STATES.PENDING,
          toStatus: VALID_STATES.EXPIRED,
          transition: 'PENDING->EXPIRED',
          metadata: { reason: 'Stuck payment auto-expired after 1 hour' },
        },
      });

      logger.warn({ paymentId: payment.id }, '[RECOVERY] Stuck payment expired');
    }

    return stuck.length;
  }

  async detectGatewayOrphans() {
    const allRazorpayOrders = await prisma.payment.findMany({
      where: { paymentProvider: 'RAZORPAY' },
      select: { razorpayOrderId: true, status: true },
    });

    const orphanCount = 0;
    logger.info({ totalOrders: allRazorpayOrders.length }, '[RECOVERY] Gateway orphan check');
    return orphanCount;
  }

  async recoverPaymentSession(tenantId, orderId) {
    const payment = await prisma.payment.findFirst({
      where: { tenantId, razorpayOrderId: orderId },
    });
    if (!payment) throw new Error('Payment not found');

    if (payment.status === VALID_STATES.SUCCESS || payment.status === VALID_STATES.CAPTURED) {
      return {
        status: 'completed',
        orderId: payment.razorpayOrderId,
        paymentId: payment.razorpayPaymentId,
        amount: payment.amount,
      };
    }

    if (paymentStateMachine.isTerminal(payment.status)) {
      return {
        status: 'terminal',
        orderStatus: payment.status,
        orderId: payment.razorpayOrderId,
      };
    }

    if (paymentStateMachine.isRecoverable(payment.status)) {
      try {
        await paymentOrchestratorService.recoverPayment(tenantId, orderId);
        const refreshed = await prisma.payment.findFirst({
          where: { tenantId, razorpayOrderId: orderId },
        });
        return {
          status: 'recovered',
          orderStatus: refreshed.status,
          orderId: refreshed.razorpayOrderId,
          paymentId: refreshed.razorpayPaymentId,
        };
      } catch (error) {
        return {
          status: 'recovery_failed',
          error: error.message,
          orderId,
        };
      }
    }

    return {
      status: 'pending',
      orderStatus: payment.status,
      orderId: payment.razorpayOrderId,
    };
  }
}

export default new PaymentRecoveryService();
