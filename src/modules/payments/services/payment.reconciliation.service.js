import prisma from '../../../config/prisma.js';
import razorpay from '../../../config/razorpay.js';
import logger from '../../../shared/utils/logger.js';
import paymentStateMachine, { VALID_STATES } from './payment.state-machine.js';
import paymentLockService from './payment.lock.service.js';

class PaymentReconciliationService {
  async reconcileAll(tenantId = null) {
    const where = tenantId ? { tenantId } : {};

    // Phase 1: Heal/Sync with Gateway
    const paymentsToReconcile = await prisma.payment.findMany({
      where: {
        ...where,
        paymentProvider: 'RAZORPAY',
        razorpayOrderId: { not: null },
        status: {
          in: [
            VALID_STATES.CREATED,
            VALID_STATES.PENDING,
            VALID_STATES.AUTHORIZED,
            VALID_STATES.CAPTURED,
          ],
        },
      },
    });

    logger.info({ count: paymentsToReconcile.length }, '[RECONCILIATION] Starting gateway sync');

    const results = { matched: 0, mismatched: 0, healed: 0, failed: 0, errors: [] };

    for (const payment of paymentsToReconcile) {
      try {
        const result = await this.reconcilePayment(payment);
        if (result.status === 'matched') results.matched++;
        else if (result.status === 'healed') results.healed++;
        else if (result.status === 'mismatched') results.mismatched++;
        else if (result.status === 'marked_failed') results.failed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ paymentId: payment.id, error: error.message });
        logger.error({ error, paymentId: payment.id }, '[RECONCILIATION] Payment error');
      }
    }

    // Phase 2: Cleanup Stale 'CREATED' records (older than 30 mins)
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const staleResult = await prisma.payment.updateMany({
      where: {
        ...where,
        status: VALID_STATES.CREATED,
        createdAt: { lt: thirtyMinsAgo },
      },
      data: {
        status: VALID_STATES.FAILED,
        failureReason: 'Transaction expired (stale CREATED record)',
      },
    });

    if (staleResult.count > 0) {
      logger.info({ count: staleResult.count }, '[RECONCILIATION] Marked stale payments as FAILED');
      results.failed += staleResult.count;
    }

    await this._storeReconciliationResult(tenantId, results);
    return results;
  }

  async reconcilePayment(payment) {
    let gatewayPayment;
    try {
      if (payment.razorpayPaymentId) {
        gatewayPayment = await razorpay.payments.fetch(payment.razorpayPaymentId);
      } else if (payment.razorpayOrderId) {
        await razorpay.orders.fetch(payment.razorpayOrderId);
        const payments = await razorpay.payments.all({ order_id: payment.razorpayOrderId });
        gatewayPayment = payments.items?.[0];
      }
    } catch (error) {
      if (error.statusCode === 404) {
        return { status: 'not_found' };
      }
      throw error;
    }

    if (!gatewayPayment) {
      if (paymentStateMachine.isPending(payment.status)) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: VALID_STATES.FAILED, failureReason: 'No gateway record found' },
        });
        return { status: 'marked_failed' };
      }
      return { status: 'no_gateway_record' };
    }

    const gatewayStatus = this._mapGatewayStatus(gatewayPayment.status);
    const internalStatus = payment.status;

    if (gatewayStatus === internalStatus) {
      return { status: 'matched' };
    }

    if (gatewayStatus === VALID_STATES.CAPTURED || gatewayStatus === VALID_STATES.SUCCESS) {
      if (paymentStateMachine.isPending(internalStatus)) {
        await paymentLockService.executeWithLock(
          `recon:${payment.id}`,
          async () => {
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: VALID_STATES.CAPTURED,
                razorpayPaymentId: gatewayPayment.id,
                paidAt: new Date(gatewayPayment.created_at * 1000),
              },
            });

            await prisma.payment.update({
              where: { id: payment.id },
              data: { status: VALID_STATES.SUCCESS },
            });

            await prisma.paymentAuditLog.create({
              data: {
                paymentId: payment.id,
                tenantId: payment.tenantId,
                fromStatus: internalStatus,
                toStatus: VALID_STATES.SUCCESS,
                transition: `${internalStatus}->SUCCESS (reconciliation)`,
                metadata: {
                  gatewayStatus: gatewayPayment.status,
                  razorpayPaymentId: gatewayPayment.id,
                },
              },
            });
          },
          10000,
        );

        logger.info(
          { paymentId: payment.id },
          '[RECONCILIATION] Healed pending payment to success',
        );
        return { status: 'healed' };
      }
    }

    if (gatewayStatus === VALID_STATES.FAILED && paymentStateMachine.isPending(internalStatus)) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: VALID_STATES.FAILED, failureReason: 'Gateway status: failed' },
      });

      logger.warn({ paymentId: payment.id }, '[RECONCILIATION] Marked pending payment as failed');
      return { status: 'healed' };
    }

    return { status: 'mismatched', internal: internalStatus, gateway: gatewayStatus };
  }

  _mapGatewayStatus(gatewayStatus) {
    const map = {
      captured: VALID_STATES.CAPTURED,
      paid: VALID_STATES.SUCCESS,
      failed: VALID_STATES.FAILED,
      authorized: VALID_STATES.AUTHORIZED,
      refunded: VALID_STATES.REFUNDED,
      created: VALID_STATES.CREATED,
    };
    return map[gatewayStatus] || gatewayStatus?.toUpperCase();
  }

  async _storeReconciliationResult(tenantId, results) {
    try {
      await prisma.paymentReconciliation.create({
        data: {
          tenantId: tenantId || 'system',
          matchedCount: results.matched,
          healedCount: results.healed,
          mismatchedCount: results.mismatched,
          failedCount: results.failed,
          details: results,
          reconciledAt: new Date(),
        },
      });
    } catch (error) {
      logger.error({ error }, '[RECONCILIATION] Failed to store result');
    }
  }

  async getReconciliationHistory(tenantId, limit = 50) {
    return prisma.paymentReconciliation.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { reconciledAt: 'desc' },
      take: limit,
    });
  }
}

export default new PaymentReconciliationService();
