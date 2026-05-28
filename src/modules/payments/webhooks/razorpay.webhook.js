import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { getConfig } from '../../../config/payment.config.js';
import { VALID_STATES } from '../services/payment.state-machine.js';
import paymentLockService from '../services/payment.lock.service.js';

class RazorpayWebhookHandler {
  verifySignature(body, signature) {
    const webhookSecret = getConfig().webhookSecret;
    if (!webhookSecret) {
      logger.error('[WEBHOOK] Webhook secret not configured');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );
    } catch {
      return false;
    }
  }

  async processWebhook(event, payload) {
    const eventId = payload.event_id || `${event}_${Date.now()}`;
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    if (!paymentEntity && !orderEntity) {
      logger.warn({ event }, '[WEBHOOK] No payment or order entity');
      return { received: true, skipped: true };
    }

    const idempotencyKey = `webhook:${eventId}:${paymentEntity?.id || orderEntity?.id}`;
    const lockKey = `webhook_lock:${paymentEntity?.order_id || orderEntity?.id}`;

    return paymentLockService.executeWithLock(lockKey, async () => {
      const existing = await prisma.paymentWebhook.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        logger.info({ event, eventId }, '[WEBHOOK] Duplicate webhook ignored');
        return { received: true, ignored: true };
      }

      await prisma.paymentWebhook.create({
        data: {
          idempotencyKey,
          event,
          payload,
          signature: payload.signature || '',
          processedAt: new Date(),
        },
      });

      logger.info({ event, eventId, paymentId: paymentEntity?.id }, '[WEBHOOK] Processing');

      const orderId = paymentEntity?.order_id || orderEntity?.id;
      if (!orderId) return { received: true, skipped: true };

      switch (event) {
        case 'payment.captured':
          await this._handlePaymentCaptured(orderId, paymentEntity);
          break;
        case 'payment.failed':
          await this._handlePaymentFailed(orderId, paymentEntity);
          break;
        case 'payment.authorized':
          await this._handlePaymentAuthorized(orderId, paymentEntity);
          break;
        case 'order.paid':
          await this._handleOrderPaid(orderEntity, paymentEntity);
          break;
        default:
          logger.info({ event }, '[WEBHOOK] Unhandled event type');
      }

      return { received: true };
    }, 20000);
  }

  async _handlePaymentCaptured(orderId, paymentEntity) {
    const paymentId = paymentEntity?.id;
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!payment) {
      logger.warn({ orderId }, '[WEBHOOK] Unknown order for captured payment');
      return;
    }

    if (payment.status === VALID_STATES.SUCCESS || payment.status === VALID_STATES.CAPTURED) {
      logger.info({ orderId }, '[WEBHOOK] Duplicate capture ignored');
      return;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        razorpayPaymentId: paymentId,
        status: VALID_STATES.CAPTURED,
        paidAt: new Date(),
      },
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: VALID_STATES.SUCCESS },
    });

    await prisma.transaction.updateMany({
      where: { razorpayOrderId: orderId },
      data: { paymentId, status: VALID_STATES.SUCCESS },
    });

    await prisma.paymentAuditLog.create({
      data: {
        paymentId: payment.id,
        tenantId: payment.tenantId,
        fromStatus: VALID_STATES.AUTHORIZED,
        toStatus: VALID_STATES.CAPTURED,
        transition: 'AUTHORIZED->CAPTURED (webhook)',
        metadata: { razorpayPaymentId: paymentId },
      },
    });

    await eventBus.publish('PAYMENT_CAPTURED', {
      tenantId: payment.tenantId,
      paymentId: payment.id,
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      amount: payment.amount,
    });

    logger.info({ orderId, paymentId }, '[WEBHOOK] Payment captured');
  }

  async _handlePaymentFailed(orderId, paymentEntity) {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!payment) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: VALID_STATES.FAILED,
        razorpayPaymentId: paymentEntity?.id || payment.razorpayPaymentId,
        failureReason: paymentEntity?.error_description || 'Gateway declined',
      },
    });

    await prisma.transaction.updateMany({
      where: { razorpayOrderId: orderId },
      data: { status: VALID_STATES.FAILED },
    });

    await eventBus.publish('PAYMENT_FAILED', {
      tenantId: payment.tenantId,
      paymentId: payment.id,
      razorpayOrderId: orderId,
      reason: paymentEntity?.error_description,
    });

    logger.warn({ orderId, error: paymentEntity?.error_description }, '[WEBHOOK] Payment failed');
  }

  async _handlePaymentAuthorized(orderId, paymentEntity) {
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!payment) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: VALID_STATES.AUTHORIZED,
        razorpayPaymentId: paymentEntity?.id,
      },
    });
  }

  async _handleOrderPaid(orderEntity, paymentEntity) {
    const orderId = orderEntity?.id;
    if (!orderId) return;

    const paymentId = paymentEntity?.id;
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId },
    });

    if (!payment) {
      const notes = orderEntity?.notes || {};
      await prisma.payment.create({
        data: {
          transactionId: `gw_${orderId}`,
          tenantId: notes.tenantId || 'unknown',
          amount: (orderEntity?.amount || 0) / 100,
          status: VALID_STATES.SUCCESS,
          paymentProvider: 'RAZORPAY',
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          paidAt: new Date(),
        },
      });
      logger.info({ orderId, paymentId }, '[WEBHOOK] Ghost payment healed via order.paid');
    }
  }
}

export default new RazorpayWebhookHandler();
