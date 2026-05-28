import { jest , describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import request from 'supertest';
import Fastify from 'fastify';

const mockCreatePaymentOrder = jest.fn();
const mockVerifyPayment = jest.fn();
const mockGetPaymentStatus = jest.fn();
const mockRecoverPayment = jest.fn();
const mockRecoverPaymentSession = jest.fn();
const mockHealthCheck = jest.fn();
const mockRazorpayHealth = jest.fn();
const mockReconcileAll = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {},
  ensureDbConnection: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.orchestrator.service.js', () => ({
  default: {
    createPaymentOrder: mockCreatePaymentOrder,
    verifyPayment: mockVerifyPayment,
    getPaymentStatus: mockGetPaymentStatus,
    recoverPayment: mockRecoverPayment,
  },
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.recovery.service.js', () => ({
  default: {
    recoverPaymentSession: mockRecoverPaymentSession,
    recoverOrphanedPayments: jest.fn(),
    detectStuckPayments: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.health.service.js', () => ({
  default: {
    checkAll: mockHealthCheck,
  },
}));

jest.unstable_mockModule('../../../src/config/razorpay.js', () => ({
  default: {
    orders: { create: jest.fn(), fetch: jest.fn() },
    payments: { all: jest.fn(), fetch: jest.fn() },
  },
  healthCheck: mockRazorpayHealth,
  getRazorpay: jest.fn(),
  resetInstance: jest.fn(),
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.reconciliation.service.js', () => ({
  default: {
    reconcileAll: mockReconcileAll,
  },
}));

jest.unstable_mockModule('../../../src/middleware/auth.fastify.js', () => ({
  authenticate: async (request) => {
    request.user = { id: 'user-1', tenantId: 'tenant-1' };
    request.tenantId = 'tenant-1';
  },
  requireTenant: async () => {},
}));

jest.unstable_mockModule('../../../src/middleware/permission.fastify.js', () => ({
  requirePermission: () => async () => {},
}));

jest.unstable_mockModule('../../../src/shared/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../../src/shared/services/eventbus.service.js', () => ({
  default: { publish: jest.fn() },
}));

const { default: paymentRoutes } = await import(
  '../../../src/modules/payments/payment.fastify.routes.js'
);

async function buildApp() {
  const app = Fastify();
  await app.register(paymentRoutes);
  await app.ready();
  return app;
}

describe('Hardened Payment API Integration', () => {
  let app;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/payments/health', () => {
    it('should return payment system health', async () => {
      mockHealthCheck.mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {
          configuration: { status: 'healthy' },
          database: { status: 'healthy' },
          redis: { status: 'healthy' },
          razorpay: { status: 'healthy' },
        },
      });

      const res = await request(app.server).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('should return 503 on degraded health', async () => {
      mockHealthCheck.mockResolvedValue({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        checks: {
          configuration: { status: 'unhealthy', errors: ['Missing key'] },
        },
      });

      const res = await request(app.server).get('/health');
      expect(res.statusCode).toBe(503);
    });
  });

  describe('POST /api/payments/create-order', () => {
    it('should create payment order with idempotency', async () => {
      mockCreatePaymentOrder.mockResolvedValue({
        id: 'order_123',
        amount: 10000,
        currency: 'INR',
        status: 'CREATED',
      });

      const res = await request(app.server)
        .post('/create-order')
        .send({ amount: 100, idempotencyKey: 'idem_123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockCreatePaymentOrder).toHaveBeenCalledWith(
        'tenant-1', 'user-1', 100, expect.objectContaining({ idempotencyKey: 'idem_123' })
      );
    });

    it('should reject invalid amount', async () => {
      const res = await request(app.server)
        .post('/create-order')
        .send({ amount: 0 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/payments/verify', () => {
    it('should verify payment signature', async () => {
      mockVerifyPayment.mockResolvedValue({
        success: true,
        status: 'SUCCESS',
        paymentId: 'pay_123',
        orderId: 'order_123',
      });

      const res = await request(app.server)
        .post('/verify')
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'sig_123',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('SUCCESS');
    });

    it('should handle verification failure', async () => {
      mockVerifyPayment.mockRejectedValue(new Error('Payment signature verification failed'));

      const res = await request(app.server)
        .post('/verify')
        .send({
          razorpay_order_id: 'order_123',
          razorpay_payment_id: 'pay_123',
          razorpay_signature: 'invalid',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/payments/status', () => {
    it('should return payment status', async () => {
      mockGetPaymentStatus.mockResolvedValue({
        id: 'pay_1',
        orderId: 'order_123',
        status: 'SUCCESS',
        amount: 100,
      });

      const res = await request(app.server)
        .get('/status?orderId=order_123');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('SUCCESS');
    });
  });

  describe('POST /api/payments/recover/:orderId', () => {
    it('should recover payment session', async () => {
      mockRecoverPaymentSession.mockResolvedValue({
        status: 'recovered',
        orderStatus: 'CAPTURED',
        orderId: 'order_123',
      });

      const res = await request(app.server)
        .post('/recover/order_123');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('recovered');
    });
  });

  describe('POST /api/payments/reconcile', () => {
    it('should trigger reconciliation', async () => {
      mockReconcileAll.mockResolvedValue({
        matched: 10,
        healed: 2,
        mismatched: 0,
        failed: 0,
      });

      const res = await request(app.server)
        .post('/reconcile');
      expect(res.statusCode).toBe(200);
    });
  });
});
