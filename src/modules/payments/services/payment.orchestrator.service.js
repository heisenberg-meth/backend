import prisma from '../../../config/prisma.js';
import razorpay from '../../../config/razorpay.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import paymentStateMachine, { VALID_STATES } from './payment.state-machine.js';
import paymentLockService from './payment.lock.service.js';
import subscriptionService from '../../subscriptions/subscription.service.js';
import { getConfig } from '../../../config/payment.config.js';
import { mainQueue } from '../../../queue/index.js';
class PaymentOrchestratorService {
  async createPaymentOrder(tenantId, userId, amount, options = {}) {
    const { currency = 'INR', receipt, notes } = options;

    return this._createOrderInternal(tenantId, userId, amount, currency, receipt, notes);
  }

  async _createOrderInternal(tenantId, userId, amount, currency, receipt, notes) {
    const config = getConfig();
    const razorpaySecret = razorpay.key_secret || config.keySecret;

    if (!razorpaySecret || razorpaySecret === 'rzp_test_secret_placeholder') {
      throw new Error(
        'Razorpay secret is not configured or is using a placeholder. Please set a valid RAZORPAY_KEY_SECRET in your .env file.',
      );
    }

    logger.info(
      {
        env: config.environment,
        mode: config.keyMode,
        amount: Math.round(amount * 100),
      },
      '[PAYMENT] Initiating order creation',
    );

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency,
        receipt: receipt || `rcpt_${tenantId.slice(0, 8)}_${Date.now()}`,
        payment_capture: 1,
        notes: { tenantId, userId: userId || '', ...notes },
      });
      logger.info(
        {
          orderId: razorpayOrder.id,
          status: razorpayOrder.status,
          amount: razorpayOrder.amount,
        },
        '[PAYMENT] Razorpay order created successfully',
      );

      if (!razorpayOrder?.id?.startsWith('order_') || razorpayOrder.id.startsWith('order_dev_')) {
        throw new Error(
          'INVALID REAL RAZORPAY ORDER: Order ID must be a valid Razorpay ID and not a development placeholder',
        );
      }
    } catch (rzpErr) {
      console.error('[RAZORPAY ERROR]', rzpErr);
      throw new Error(
        `Razorpay order creation failed: ${rzpErr.message || 'Unknown Razorpay error'}`,
      );
    }

    let payment;
    try {
      payment = await prisma.payment.create({
        data: {
          transactionId: razorpayOrder.id,
          tenantId,
          amount,
          currency,
          status: VALID_STATES.CREATED,
          paymentProvider: 'RAZORPAY',
          razorpayOrderId: razorpayOrder.id,
        },
      });
    } catch (prismaErr) {
      console.error('[PRISMA PAYMENT ERROR]', prismaErr);
      throw new Error(`DB Payment creation failed: ${prismaErr.message}`);
    }

    // Only create Transaction record if a valid userId is present to satisfy FK constraints
    if (userId) {
      try {
        await prisma.transaction.create({
          data: {
            tenantId,
            userId,
            amount,
            currency,
            razorpayOrderId: razorpayOrder.id,
            receipt: razorpayOrder.receipt,
            status: VALID_STATES.CREATED,
            gatewayResponse: notes, // Store the business metadata
          },
        });
      } catch (prismaTxErr) {
        logger.error(
          {
            event: 'PAYMENT_TRANSACTION_RECORD_FAILED',
            tenantId,
            razorpayOrderId: razorpayOrder.id,
            error: prismaTxErr.message,
          },
          'Payment transaction record creation failed — payment order exists but transaction record missing',
        );
        // Queue retry to create the missing transaction record
        try {
          await mainQueue.add(
            'create-transaction-record-retry',
            {
              paymentId: payment.id,
              tenantId,
              userId,
              amount,
              currency,
              razorpayOrderId: razorpayOrder.id,
              receipt: razorpayOrder.receipt,
              notes,
              attempt: 1,
            },
            { attempts: 5, backoff: { type: 'exponential', delay: 10000 } },
          );
        } catch (queueErr) {
          logger.error(
            { event: 'TRANSACTION_RECORD_RETRY_QUEUE_FAILURE', tenantId, error: queueErr.message },
            'Failed to queue transaction record retry',
          );
        }
      }
    }

    await eventBus.publish('PAYMENT_ORDER_CREATED', {
      paymentId: payment.id,
      tenantId,
      amount,
      razorpayOrderId: razorpayOrder.id,
    });

    logger.info({ razorpayOrderId: razorpayOrder.id, tenantId, amount }, '[PAYMENT] Order created');

    return {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: VALID_STATES.CREATED,
      paymentId: payment.id,
    };
  }

  async verifyPayment(tenantId, verificationData) {
    // Support calling verifyPayment(verificationData) directly for unauthenticated route
    let actualTenantId = tenantId;
    let actualVerificationData = verificationData;
    if (typeof tenantId === 'object' && tenantId !== null && !verificationData) {
      actualVerificationData = tenantId;
      actualTenantId = null;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = actualVerificationData;

    logger.info(
      {
        razorpay_order_id,
        razorpay_payment_id,
        hasSignature: !!razorpay_signature,
        tenantId: actualTenantId,
      },
      '[PAYMENT] Starting verification',
    );

    const payment = await prisma.payment.findUnique({
      where: { transactionId: razorpay_order_id },
    });

    if (!payment) {
      logger.error({ razorpay_order_id }, '[PAYMENT] Payment order not found');
      throw new Error('Payment order not found');
    }

    if (actualTenantId && payment.tenantId !== actualTenantId) {
      logger.error(
        { razorpay_order_id, expectedTenant: actualTenantId, actualTenant: payment.tenantId },
        '[PAYMENT] Tenant mismatch',
      );
      throw new Error('Tenant mismatch');
    }

    if (payment.status === VALID_STATES.SUCCESS) {
      logger.info({ razorpay_order_id }, '[PAYMENT] Already verified, returning success');
      return { success: true, status: VALID_STATES.SUCCESS, orderId: razorpay_order_id };
    }

    logger.info(
      { razorpay_order_id, currentStatus: payment.status },
      '[PAYMENT] Acquiring lock for verification',
    );

    const lockKey = `verify:${razorpay_order_id}`;
    return paymentLockService.executeWithLock(
      lockKey,
      async () => {
        logger.info({ razorpay_order_id }, '[PAYMENT] Lock acquired, starting transaction');

        return prisma.$transaction(async (tx) => {
          const current = await tx.payment.findUnique({
            where: { transactionId: razorpay_order_id },
          });

          logger.info(
            { razorpay_order_id, status: current.status },
            '[PAYMENT] Payment found in transaction',
          );

          if (current.status === VALID_STATES.SUCCESS || current.status === VALID_STATES.CAPTURED) {
            logger.info({ razorpay_order_id }, '[PAYMENT] Already completed in concurrent request');
            return { success: true, status: current.status, orderId: razorpay_order_id };
          }

          logger.info({ razorpay_order_id }, '[PAYMENT] Verifying Razorpay signature');
          const isValid = this._verifyRazorpaySignature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
          );

          if (!isValid) {
            logger.error({ razorpay_order_id }, '[PAYMENT] Signature verification failed');
            await this._transitionPayment(
              current.id,
              VALID_STATES.FAILED,
              {
                failureReason: 'Signature verification failed',
                razorpayPaymentId: razorpay_payment_id,
              },
              tx,
            );
            throw new Error('Payment signature verification failed');
          }

          logger.info({ razorpay_order_id }, '[PAYMENT] Signature verified successfully');

          const targetTenantId = current.tenantId;

          if (current.status === VALID_STATES.CREATED || current.status === VALID_STATES.PENDING) {
            logger.info(
              { razorpay_order_id, from: current.status, to: VALID_STATES.SUCCESS },
              '[PAYMENT] Transitioning payment status',
            );

            await this._transitionPayment(
              current.id,
              VALID_STATES.SUCCESS,
              {
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                paidAt: new Date(),
              },
              tx,
            );

            logger.info({ razorpay_order_id }, '[PAYMENT] Payment updated to SUCCESS');

            await tx.transaction.update({
              where: { razorpayOrderId: razorpay_order_id },
              data: {
                paymentId: razorpay_payment_id,
                status: VALID_STATES.SUCCESS,
              },
            });

            logger.info({ razorpay_order_id }, '[PAYMENT] Transaction record updated');

            // --- Trigger Business Logic (Subscription Activation) ---
            const transaction = await tx.transaction.findUnique({
              where: { razorpayOrderId: razorpay_order_id },
            });
            const notes = transaction?.gatewayResponse || {};

            logger.info(
              { razorpay_order_id, hasNotes: !!notes, noteType: notes?.type },
              '[PAYMENT] Checking for subscription activation',
            );

            if (notes?.type === 'SUBSCRIPTION_UPGRADE') {
              logger.info(
                { tenantId: targetTenantId, notes },
                '[PAYMENT] Activating subscription',
              );

              const planId = notes.planId || 'pro';
              const billingCycle = notes.billingCycle || 'monthly';

              await subscriptionService.createSubscription(
                targetTenantId,
                planId,
                billingCycle,
                null,
                tx,
              );

              logger.info({ razorpay_order_id, planId }, '[PAYMENT] Subscription activated');

              await tx.tenant.update({
                where: { id: targetTenantId },
                data: {
                  isVerified: true,
                  verifiedAt: new Date(),
                },
              });

              await tx.auditLog.create({
                data: {
                  tenantId: targetTenantId,
                  action: 'SUBSCRIPTION_ACTIVATED',
                  target: planId,
                  type: 'SUBSCRIPTION',
                },
              });
            }
          }

          await eventBus.publish('PAYMENT_SUCCESS', {
            tenantId: targetTenantId,
            paymentId: current.id,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: current.amount,
          });

          logger.info(
            { razorpay_order_id, razorpay_payment_id },
            '[PAYMENT] Verification completed successfully',
          );

          return {
            success: true,
            status: VALID_STATES.SUCCESS,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
          };
        });
      },
      15000,
    );
  }

  async _verifyRazorpaySignature(orderId, paymentId, signature) {
    const crypto = (await import('crypto')).default;
    const secret = getConfig().keySecret;
    if (!secret) throw new Error('Razorpay secret not configured');

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async _transitionPayment(paymentId, newStatus, extra = {}, tx = null) {
    const client = tx || prisma;
    const payment = await client.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found for transition`);
    }

    paymentStateMachine.validateTransition(payment.status, newStatus);

    const updateData = { status: newStatus, ...extra };
    if (extra.paidAt) updateData.paidAt = extra.paidAt;

    const execute = async (t) => {
      const updated = await t.payment.update({
        where: { id: paymentId },
        data: updateData,
      });

      await t.paymentAuditLog.create({
        data: {
          paymentId,
          tenantId: payment.tenantId,
          fromStatus: payment.status,
          toStatus: newStatus,
          transition: `${payment.status}->${newStatus}`,
          metadata: extra,
        },
      });

      return updated;
    };

    const updated = await (tx ? execute(tx) : prisma.$transaction(execute));

    logger.info({ paymentId, from: payment.status, to: newStatus }, '[STATE] Payment transition');
    return updated;
  }

  async getPaymentStatus(tenantId, orderId) {
    const payment = await prisma.payment.findFirst({
      where: { tenantId, razorpayOrderId: orderId },
      include: { allocations: true },
    });
    if (!payment) return null;

    return {
      id: payment.id,
      orderId: payment.razorpayOrderId,
      paymentId: payment.razorpayPaymentId,
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    };
  }

  async recoverPayment(tenantId, orderId) {
    const payment = await prisma.payment.findFirst({
      where: { tenantId, razorpayOrderId: orderId },
    });
    if (!payment) throw new Error('Payment not found');
    if (!paymentStateMachine.isRecoverable(payment.status)) {
      throw new Error(`Payment ${orderId} is not recoverable (status: ${payment.status})`);
    }

    let razorpayOrder;
    try {
      razorpayOrder = await razorpay.orders.fetch(orderId);
    } catch (error) {
      logger.error({ error, orderId }, '[RECOVERY] Failed to fetch Razorpay order');
      throw new Error('Cannot reach payment gateway for recovery');
    }

    const razorpayStatus = razorpayOrder.status;

    if (razorpayStatus === 'paid' || razorpayStatus === 'captured') {
      const payments = await razorpay.payments.all({ order_id: orderId });
      const successfulPayment = payments.items?.find((p) => p.status === 'captured');
      if (successfulPayment) {
        return this._transitionPayment(payment.id, VALID_STATES.CAPTURED, {
          razorpayPaymentId: successfulPayment.id,
          paidAt: new Date(successfulPayment.created_at * 1000),
        });
      }
    }

    if (razorpayStatus === 'attempted') {
      return this._transitionPayment(payment.id, VALID_STATES.PENDING, {});
    }

    if (razorpayStatus === 'failed' || razorpayStatus === 'cancelled') {
      await this._transitionPayment(payment.id, VALID_STATES.FAILED, {
        failureReason: `Gateway status: ${razorpayStatus}`,
      });
      throw new Error(`Payment failed at gateway: ${razorpayStatus}`);
    }

    return payment;
  }
}

export default new PaymentOrchestratorService();
