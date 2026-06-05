import crypto from 'crypto';
import logger from '../../../shared/utils/logger.js';
import { getQueueMetrics } from '../queue/payment.queue.js';

class PaymentObservabilityService {
  generateCorrelationId() {
    return `pay_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  logPaymentMutation(event, data) {
    logger.info(
      {
        event,
        correlationId: data.correlationId,
        paymentId: data.paymentId,
        orderId: data.orderId,
        tenantId: data.tenantId,
        amount: data.amount,
        status: data.status,
        prevStatus: data.prevStatus,
        duration: data.duration ? `${data.duration}ms` : undefined,
      },
      `[PAYMENT:${event}]`,
    );
  }

  logGatewayCall(gateway, operation, duration, success, error = null) {
    const level = success ? 'info' : 'error';
    logger[level](
      {
        gateway,
        operation,
        duration: `${duration}ms`,
        success,
        error: error?.message,
      },
      `[GATEWAY:${gateway}] ${operation} ${success ? 'succeeded' : 'failed'}`,
    );
  }

  logQueueEvent(queue, action, jobId, data = {}) {
    logger.info(
      {
        queue,
        action,
        jobId,
        ...data,
      },
      `[QUEUE:${queue}] ${action}`,
    );
  }

  async getFullPaymentDiagnostics(tenantId, paymentId) {
    const prisma = (await import('../../../config/prisma.js')).default;

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      include: {
        allocations: { include: { invoice: true } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!payment) return null;

    const webhookEvents = await prisma.paymentWebhook.findMany({
      where: {
        payload: {
          path: ['payload', 'payment', 'entity', 'id'],
          equals: payment.razorpayPaymentId,
        },
      },
      orderBy: { processedAt: 'asc' },
    });

    const recoveryAttempts = await prisma.paymentRecovery.findMany({
      where: { paymentId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      payment,
      timeline: payment.auditLogs,
      webhookEvents,
      recoveryAttempts,
      queueMetrics: await getQueueMetrics(),
    };
  }
}

export default new PaymentObservabilityService();
