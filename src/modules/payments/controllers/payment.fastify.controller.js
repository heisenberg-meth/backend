import prisma, { ensureDbConnection } from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import paymentOrchestratorService from '../services/payment.orchestrator.service.js';
import paymentRecoveryService from '../services/payment.recovery.service.js';
import paymentReconciliationService from '../services/payment.reconciliation.service.js';
import paymentHealthService from '../services/payment.health.service.js';
import razorpayWebhookHandler from '../webhooks/razorpay.webhook.js';
import { enqueueWebhook, getQueueMetrics } from '../queue/payment.queue.js';
import { getConfig } from '../../../config/payment.config.js';

const formatStatusResponse = (statusObj) => {
  if (!statusObj) return { success: false, paymentStatus: 'PENDING' };

  const statusMap = {
    SUCCESS: 'SUCCESS',
    CAPTURED: 'SUCCESS',
    FAILED: 'FAILED',
    PENDING: 'PENDING',
    CREATED: 'PENDING',
    AUTHORIZED: 'PENDING',
    EXPIRED: 'TIMEOUT',
    TIMEOUT: 'TIMEOUT',
    CANCELLED: 'CANCELLED',
  };

  const paymentStatus = statusMap[statusObj.status] || 'PENDING';

  if (paymentStatus === 'SUCCESS') {
    return {
      success: true,
      paymentStatus: 'SUCCESS',
      subscriptionActive: true,
      plan: statusObj.planName || 'Professional',
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

class PaymentFastifyController {
  async createOrder(request, reply) {
    const { amount, receipt } = request.body;
    const idempotencyKey =
      request.body.idempotencyKey || request.headers['x-idempotency-key'] || null;
    const tenantId = request.tenantId;
    const userId = request.user?.id;

    request.log.info(
      {
        tenantId,
        userId,
        amount,
      },
      '[DIAGNOSTIC] Payment order creation initiated',
    );

    if (!amount || amount <= 0) {
      return reply.code(400).send({ success: false, error: 'Invalid amount' });
    }

    try {
      // Ensure DB connection is active before critical payment operation
      await ensureDbConnection();

      const options = {
        receipt,
        idempotencyKey,
        notes: {
          planName: request.body.planName,
          planId: request.body.planId,
          billingCycle: request.body.billingCycle,
          type: 'SUBSCRIPTION_UPGRADE',
        },
      };
      const order = await paymentOrchestratorService.createPaymentOrder(
        tenantId,
        userId,
        Number(amount),
        options,
      );
      logger.info({ 'CONTROLLER RESPONSE =': order });
      return reply.send({
        success: true,
        key: getConfig().keyId || process.env.RAZORPAY_KEY_ID,
        order,
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        data: {
          ...order,
          key: getConfig().keyId || process.env.RAZORPAY_KEY_ID,
        },
      });
    } catch (error) {
      if (error.message?.includes('Resource locked')) {
        return reply.code(409).send({ success: false, error: 'Request in progress' });
      }
      logger.error(
        {
          message: error.message,
          stack: error.stack,
          code: error.code,
          tenantId,
        },
        '[PAYMENT] Create order failed',
      );

      // Return descriptive error message for debugging
      return reply.code(500).send({
        success: false,
        error: error.message || 'Failed to create payment order',
      });
    }
  }

  async verifyPayment(request, reply) {
    const tenantId = request.tenantId;

    try {
      await ensureDbConnection();
      const result = await paymentOrchestratorService.verifyPayment(tenantId, request.body);
      return reply.send({
        success: true,
        paymentStatus: 'SUCCESS',
        subscriptionActive: true,
        plan: 'Professional',
        data: result,
      });
    } catch (error) {
      if (error.message === 'Payment signature verification failed') {
        return reply
          .code(400)
          .send({ success: false, paymentStatus: 'FAILED', reason: error.message });
      }
      if (error.message?.includes('Invalid payment state transition')) {
        return reply
          .code(409)
          .send({ success: false, paymentStatus: 'FAILED', reason: error.message });
      }
      logger.error(
        {
          message: error.message,
          stack: error.stack,
          code: error.code,
          tenantId,
        },
        '[PAYMENT] Verify failed',
      );
      return reply
        .code(400)
        .send({ success: false, paymentStatus: 'FAILED', reason: 'Payment verification failed' });
    }
  }

  async getPaymentStatus(request, reply) {
    const tenantId = request.tenantId;
    const { orderId } = request.query;

    try {
      const status = await paymentOrchestratorService.getPaymentStatus(tenantId, orderId);
      if (!status) {
        return reply.code(404).send({ success: false, paymentStatus: 'PENDING' });
      }
      return reply.send(formatStatusResponse(status));
    } catch (error) {
      logger.error({ error, orderId, tenantId }, '[PAYMENT] Status failed');
      return reply.code(500).send({ success: false, paymentStatus: 'PENDING' });
    }
  }

  async getPaymentStatusByOrderId(request, reply) {
    const tenantId = request.tenantId;
    const { orderId } = request.params;

    try {
      const status = await paymentOrchestratorService.getPaymentStatus(tenantId, orderId);
      if (!status) {
        return reply.code(404).send({
          success: false,
          paymentStatus: 'PENDING',
          code: 'PAYMENT_NOT_FOUND',
        });
      }
      return reply.send(formatStatusResponse(status));
    } catch (error) {
      logger.error({ error, orderId, tenantId }, '[PAYMENT] Status by orderId failed');
      return reply.code(500).send({ success: false, paymentStatus: 'PENDING' });
    }
  }

  async recoverPayment(request, reply) {
    const tenantId = request.tenantId;
    const { orderId } = request.params;

    try {
      const result = await paymentRecoveryService.recoverPaymentSession(tenantId, orderId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async handleWebhook(request, reply) {
    const signature = request.headers['x-razorpay-signature'];
    const rawBody = request.rawBody || JSON.stringify(request.body);

    const isValid = razorpayWebhookHandler.verifySignature(rawBody, signature);
    if (!isValid) {
      request.log.error(
        {
          event: 'WEBHOOK_INVALID_SIGNATURE',
          signature,
        },
        'Invalid webhook signature',
      );
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    try {
      await enqueueWebhook(request.body.event, {
        ...request.body,
        signature,
      });

      return reply.code(202).send({ received: true });
    } catch (error) {
      request.log.error(
        {
          event: 'WEBHOOK_QUEUE_FAILURE',
          error: error.message,
          stack: error.stack,
        },
        'Failed to queue webhook',
      );
      return reply.code(500).send({ error: 'Failed to queue webhook' });
    }
  }

  async settleInvoice(request, reply) {
    const settlementService = (await import('../settlement/settlement.service.js')).default;
    const { tenantId, id: userId } = request.user;
    const { id: invoiceId } = request.params;
    const { payments } = request.body;
    const idempotencyKey = request.body.idempotencyKey || request.headers['x-idempotency-key'];

    try {
      const result = await settlementService.settleInvoice({
        tenantId,
        userId,
        invoiceId,
        payments,
        idempotencyKey,
      });
      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, invoiceId, tenantId }, '[PAYMENT] Settle failed');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async refundAllocation(request, reply) {
    const refundService = (await import('../refunds/refund.service.js')).default;
    const { tenantId, id: userId } = request.user;
    const { id: allocationId } = request.params;
    const { amount, reason } = request.body;

    try {
      const result = await refundService.refundAllocation({
        tenantId,
        userId,
        allocationId,
        amount,
        reason,
      });
      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, allocationId, tenantId }, '[PAYMENT] Refund failed');
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getPayments(request, reply) {
    const { tenantId } = request.user;
    const { status, method, from, to, page = 1, limit = 50, search } = request.query;

    try {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);
      const where = {
        tenantId,
        ...(status ? { status } : {}),
        ...(method ? { paymentMethod: method } : {}),
        ...(from || to
          ? {
              paidAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { transactionId: { contains: search, mode: 'insensitive' } },
                { transactionReference: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: { allocations: { include: { invoice: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.payment.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: payments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      logger.error({ error, tenantId }, '[PAYMENT] List failed');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  async getPaymentById(request, reply) {
    const { tenantId } = request.user;
    const { id } = request.params;

    try {
      const payment = await prisma.payment.findFirst({
        where: { id, tenantId },
        include: {
          allocations: { include: { invoice: true } },
          auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      });
      if (!payment) {
        return reply.code(404).send({ success: false, message: 'Payment not found' });
      }
      return reply.send({ success: true, data: payment });
    } catch (error) {
      logger.error({ error, id, tenantId }, '[PAYMENT] Fetch failed');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  async getPaymentSummary(request, reply) {
    const { tenantId } = request.user;
    const { from, to } = request.query;

    try {
      const where = {
        tenantId,
        status: 'SUCCESS',
        ...(from || to
          ? {
              paidAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      };

      const aggregations = await prisma.payment.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { amount: true },
        _count: { id: true },
      });

      const totalRevenue = await prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
      });

      return reply.send({
        success: true,
        data: {
          byMethod: aggregations,
          total: totalRevenue._sum.amount || 0,
          count: totalRevenue._count.id || 0,
        },
      });
    } catch (error) {
      logger.error({ error, tenantId }, '[PAYMENT] Summary failed');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  async getPaymentTimeline(request, reply) {
    const { tenantId } = request.user;
    const { paymentId } = request.params;

    try {
      const auditLogs = await prisma.paymentAuditLog.findMany({
        where: { paymentId, tenantId },
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({ success: true, data: auditLogs });
    } catch (error) {
      logger.error({ error, paymentId, tenantId }, '[PAYMENT] Timeline failed');
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  }

  async reconcilePayments(request, reply) {
    const { tenantId } = request.user;

    try {
      const result = await paymentReconciliationService.reconcileAll(tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getReconciliationHistory(request, reply) {
    const { tenantId } = request.user;

    try {
      const history = await paymentReconciliationService.getReconciliationHistory(tenantId);
      return reply.send({ success: true, data: history });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async healthCheck(request, reply) {
    const health = await paymentHealthService.checkAll();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    return reply.code(statusCode).send(health);
  }

  async razorpayHealth(request, reply) {
    const razorpayHealthCheck = (await import('../../../config/razorpay.js')).healthCheck;
    const health = await razorpayHealthCheck();
    return reply.send(health);
  }

  async getQueueMetricsHandler(request, reply) {
    const metrics = await getQueueMetrics();
    return reply.send({ success: true, data: metrics });
  }

  async getConfig(request, reply) {
    const config = getConfig();
    return reply.send({
      success: true,
      data: {
        environment: config.environment,
        keyMode: config.keyMode,
        isProduction: config.isProduction,
        retryConfig: config.retryConfig,
      },
    });
  }
}

export default new PaymentFastifyController();
