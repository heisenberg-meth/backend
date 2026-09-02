import { jest, describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import request from 'supertest';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../src/config/prisma.js');
const orchestratorServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.orchestrator.service.js',
);
const recoveryServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.recovery.service.js',
);
const healthServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.health.service.js',
);
const razorpayPath = path.resolve(__dirname, '../../../src/config/razorpay.js');
const reconciliationServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.reconciliation.service.js',
);
const authFastifyPath = path.resolve(__dirname, '../../../src/middleware/auth.fastify.js');
const permissionFastifyPath = path.resolve(
  __dirname,
  '../../../src/middleware/permission.fastify.js',
);
const loggerPath = path.resolve(__dirname, '../../../src/shared/utils/logger.js');
const eventbusServicePath = path.resolve(
  __dirname,
  '../../../src/shared/services/eventbus.service.js',
);
const paymentConfigPath = path.resolve(__dirname, '../../../src/config/payment.config.js');
const paymentRoutesPath = path.resolve(
  __dirname,
  '../../../src/modules/payments/payment.fastify.routes.js',
);

const mockCreatePaymentOrder = jest.fn();
const mockVerifyPayment = jest.fn();
const mockGetPaymentStatus = jest.fn();
const mockRecoverPayment = jest.fn();
const mockRecoverPaymentSession = jest.fn();
const mockHealthCheck = jest.fn();
const mockRazorpayHealth = jest.fn();
const mockReconcileAll = jest.fn();

jest.unstable_mockModule(prismaPath, () => ({
  default: {},
  ensureDbConnection: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule(orchestratorServicePath, () => ({
  default: {
    createPaymentOrder: mockCreatePaymentOrder,
    verifyPayment: mockVerifyPayment,
    getPaymentStatus: mockGetPaymentStatus,
    recoverPayment: mockRecoverPayment,
  },
}));

jest.unstable_mockModule(recoveryServicePath, () => ({
  default: {
    recoverPaymentSession: mockRecoverPaymentSession,
    recoverOrphanedPayments: jest.fn(),
    detectStuckPayments: jest.fn(),
  },
}));

jest.unstable_mockModule(healthServicePath, () => ({
  default: {
    checkAll: mockHealthCheck,
  },
}));

jest.unstable_mockModule(razorpayPath, () => ({
  default: {
    orders: { create: jest.fn(), fetch: jest.fn() },
    payments: { all: jest.fn(), fetch: jest.fn() },
  },
  healthCheck: mockRazorpayHealth,
  getRazorpay: jest.fn(),
  resetInstance: jest.fn(),
}));

jest.unstable_mockModule(reconciliationServicePath, () => ({
  default: {
    reconcileAll: mockReconcileAll,
  },
}));

jest.unstable_mockModule(authFastifyPath, () => ({
  authenticate: async (request) => {
    request.user = { id: 'user-1', tenantId: 'tenant-1' };
    request.tenantId = 'tenant-1';
  },
  requireTenant: async () => {},
}));

jest.unstable_mockModule(permissionFastifyPath, () => ({
  requirePermission: () => async () => {},
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule(eventbusServicePath, () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule(paymentConfigPath, () => ({
  getConfig: () => ({
    keyId: 'rzp_test_mockkeyid123',
    keySecret: 'mockkeysecret123',
    webhookSecret: 'mockwebhooksecret123',
    environment: 'test',
    isProduction: false,
    keyMode: 'TEST',
    retryConfig: {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffFactor: 2,
    },
    webhookConfig: {
      signatureHeader: 'x-razorpay-signature',
      timeout: 1000,
    },
    idempotencyTtlMs: 10000,
    lockTtlMs: 10000,
  }),
  validateEnvironment: () => true,
  isConfigured: () => true,
  getValidationErrors: () => [],
}));

const { default: paymentRoutes } = await import(paymentRoutesPath);

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
        'tenant-1',
        'user-1',
        100,
        expect.objectContaining({ idempotencyKey: 'idem_123' }),
      );
    });

    it('should reject invalid amount', async () => {
      const res = await request(app.server).post('/create-order').send({ amount: 0 });
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

      const res = await request(app.server).post('/verify').send({
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('SUCCESS');
    });

    it('should handle verification failure', async () => {
      mockVerifyPayment.mockRejectedValue(new Error('Payment signature verification failed'));

      const res = await request(app.server).post('/verify').send({
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

      const res = await request(app.server).get('/status?orderId=order_123');
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

      const res = await request(app.server).post('/recover/order_123');
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

      const res = await request(app.server).post('/reconcile');
      expect(res.statusCode).toBe(200);
    });
  });
});
