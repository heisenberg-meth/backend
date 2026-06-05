import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class PaymentService {
  verifySignature(payload, signature, secret) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  async handleWebhook(payload, signature, secret) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { transactionId: payload.transactionId },
    });

    if (existingPayment && existingPayment.status === payload.status) {
      return { status: 'ignored' };
    }

    const idempotencyKey = `pay_${payload.transactionId}_${payload.status}`;
    const existingIdempotency = await prisma.idempotencyKey.findUnique({
      where: { idempotencyKey },
    });

    if (existingIdempotency) {
      return { status: 'ignored' };
    }

    await prisma.idempotencyKey.create({
      data: { idempotencyKey },
    });

    const payment = await prisma.payment.create({
      data: {
        transactionId: payload.transactionId,
        status: payload.status,
        amount: payload.amount,
        currency: payload.currency,
        paymentMethod: payload.paymentMethod,
        tenantId: payload.tenantId,
        metadata: payload.metadata,
      },
    });

    logger.info(
      `[Webhook] Processed payment ${payment.id} for transaction ${payload.transactionId}`,
    );
    return { status: 'processed', payment };
  }
}

export default new PaymentService();
