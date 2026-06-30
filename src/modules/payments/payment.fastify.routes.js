import paymentController from './controllers/payment.fastify.controller.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

async function paymentRoutes(authScope) {
  // ── Health Routes (no auth) ──
  authScope.get(
    '/health',
    {
      schema: { tags: ['Payments'], summary: 'Payment system health' },
    },
    paymentController.healthCheck,
  );

  authScope.get(
    '/health/razorpay',
    {
      schema: { tags: ['Payments'], summary: 'Razorpay connectivity health' },
    },
    paymentController.razorpayHealth,
  );

  // ── Webhook (no auth, signature-based) ──
  authScope.post(
    '/webhook',
    {
      schema: { tags: ['Payments'], summary: 'Razorpay webhook receiver' },
      config: { rawBody: true },
    },
    paymentController.handleWebhook,
  );

  authScope.post(
    '/verify',
    {
      schema: {
        tags: ['Payments'],
        summary: 'Verify payment signature',
        body: {
          type: 'object',
          required: ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'],
          properties: {
            razorpay_order_id: { type: 'string' },
            razorpay_payment_id: { type: 'string' },
            razorpay_signature: { type: 'string' },
          },
        },
      },
    },
    paymentController.verifyPayment,
  );

  // ── Authenticated Routes (Wrapped in a Plugin to isolate hooks) ──
  authScope.register(async (authScope) => {
    authScope.addHook('preHandler', authenticate);
    authScope.addHook('preHandler', requireTenant);

    // ── Razorpay Order Management ──
    authScope.post(
      '/create-order',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Create payment order',
          body: {
            type: 'object',
            required: ['amount'],
            properties: {
              amount: { type: 'number', minimum: 1 },
              receipt: { type: 'string' },
              idempotencyKey: { type: 'string' },
            },
          },
        },
        preHandler: [requirePermission('payment.create')],
      },
      paymentController.createOrder,
    );

    // ── Payment Recovery & Status ──
    authScope.get(
      '/status/:orderId',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Get payment status by order ID (path param)',
          params: {
            type: 'object',
            required: ['orderId'],
            properties: { orderId: { type: 'string' } },
          },
        },
      },
      paymentController.getPaymentStatusByOrderId,
    );

    authScope.get(
      '/status',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Get payment status by order ID (query param)',
          querystring: {
            type: 'object',
            required: ['orderId'],
            properties: { orderId: { type: 'string' } },
          },
        },
      },
      paymentController.getPaymentStatus,
    );

    authScope.post(
      '/recover/:orderId',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Recover payment session',
          params: {
            type: 'object',
            required: ['orderId'],
            properties: { orderId: { type: 'string' } },
          },
        },
      },
      paymentController.recoverPayment,
    );

    // ── Payment Timeline / Audit ──
    authScope.get(
      '/:paymentId/timeline',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Get payment state timeline',
          params: {
            type: 'object',
            properties: { paymentId: { type: 'string', format: 'uuid' } },
          },
        },
      },
      paymentController.getPaymentTimeline,
    );

    // ── Reconciliation ──
    authScope.post(
      '/reconcile',
      {
        schema: { tags: ['Payments'], summary: 'Trigger payment reconciliation' },
        preHandler: [requirePermission('payment.reconcile')],
      },
      paymentController.reconcilePayments,
    );

    authScope.get(
      '/reconciliation/history',
      {
        schema: { tags: ['Payments'], summary: 'Get reconciliation history' },
      },
      paymentController.getReconciliationHistory,
    );

    // ── Queue Metrics ──
    authScope.get(
      '/queue/metrics',
      {
        schema: { tags: ['Payments'], summary: 'Get payment queue metrics' },
        preHandler: [requirePermission('payment.admin')],
      },
      paymentController.getQueueMetricsHandler,
    );

    // ── Payment Config ──
    authScope.get(
      '/config',
      {
        schema: { tags: ['Payments'], summary: 'Get payment config (sanitized)' },
      },
      paymentController.getConfig,
    );

    // ── Financial Settlement ──
    authScope.post(
      '/invoices/:id/payment',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Settle invoice with payments',
          params: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          body: {
            type: 'object',
            required: ['payments'],
            properties: {
              payments: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['method', 'amount'],
                  properties: {
                    method: { type: 'string' },
                    amount: { type: 'number' },
                    referenceNumber: { type: 'string' },
                  },
                },
              },
              idempotencyKey: { type: 'string' },
            },
          },
        },
        preHandler: [requirePermission('payment.create')],
      },
      paymentController.settleInvoice,
    );

    // ── Refund Engine ──
    authScope.post(
      '/allocations/:id/refund',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Refund payment allocation',
          params: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
          },
          body: {
            type: 'object',
            required: ['reason'],
            properties: {
              reason: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
        preHandler: [requirePermission('payment.refund')],
      },
      paymentController.refundAllocation,
    );

    // ── Payment Analytics ──
    authScope.get(
      '/history',
      {
        schema: {
          tags: ['Payments'],
          summary: 'List payments',
          querystring: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              method: { type: 'string' },
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
              page: { type: 'integer', default: 1 },
              limit: { type: 'integer', default: 50 },
              search: { type: 'string' },
            },
          },
        },
      },
      paymentController.getPayments,
    );

    authScope.get(
      '/summary',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Payment summary',
          querystring: {
            type: 'object',
            properties: {
              from: { type: 'string', format: 'date-time' },
              to: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      paymentController.getPaymentSummary,
    );

    authScope.get(
      '/:id',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Get payment by ID',
          params: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
          },
        },
      },
      paymentController.getPaymentById,
    );
  });
}

export default paymentRoutes;
