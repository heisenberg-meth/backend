import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';

const mockPrisma = {
  stockAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
  },
  expiryAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    groupBy: jest.fn(),
  },
  inventoryBatch: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  medicine: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  invoiceItem: {
    aggregate: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../config/redis.js', () => ({
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(0),
    keys: jest.fn().mockResolvedValue([]),
  },
}));

jest.unstable_mockModule('../repositories/alert.repository.js', () => ({
  default: {
    findLowStockAlerts: jest.fn().mockResolvedValue({
      alerts: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    }),
    findExpiryAlerts: jest.fn().mockResolvedValue({
      alerts: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    }),
    findOutOfStockAlerts: jest.fn().mockResolvedValue({
      alerts: [],
      total: 0,
      pagination: { total: 0, page: 1, limit: 100, totalPages: 0 },
    }),
    upsertStockAlert: jest.fn(),
    upsertExpiryAlert: jest.fn(),
    resolveStockAlerts: jest.fn(),
  },
}));

jest.unstable_mockModule('../forecasting/forecasting.service.js', () => ({
  default: {
    predictDaysRemaining: jest.fn().mockResolvedValue(30),
    getReorderRecommendations: jest.fn().mockResolvedValue({
      recommendedOrderQuantity: 100,
      averageDailyUsage: 10,
      leadTime: 7,
    }),
  },
}));

jest.unstable_mockModule('../../../shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
  erpEventBus: { add: jest.fn(), close: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/services/eventbus.service.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../../config/queue-registry.js', () => ({
  registerQueue: jest.fn((q) => q),
  registerWorker: jest.fn((w) => w),
  closeAllQueuesAndWorkers: jest.fn(),
  activeQueues: [],
  activeWorkers: [],
}));

jest.unstable_mockModule('../../../config/payment.config.js', () => ({
  getConfig: jest.fn(() => ({
    keyId: 'rzp_test_dummy12345678',
    keySecret: 'testsecret1234567890',
  })),
  validateEnvironment: jest.fn(() => true),
  getValidationErrors: jest.fn(() => []),
  isConfigured: jest.fn(() => true),
  PAYMENT_ENV_KEYS: [],
  default: {
    getConfig: jest.fn(() => ({
      keyId: 'rzp_test_dummy12345678',
      keySecret: 'testsecret1234567890',
    })),
    validateEnvironment: jest.fn(() => true),
    getValidationErrors: jest.fn(() => []),
    isConfigured: jest.fn(() => true),
  },
}));

jest.unstable_mockModule('../../../config/razorpay.js', () => ({
  default: {
    orders: { create: jest.fn(), fetch: jest.fn() },
    payments: { all: jest.fn(), fetch: jest.fn() },
  },
  healthCheck: jest.fn(),
  getRazorpay: jest.fn(),
  resetInstance: jest.fn(),
}));

const { default: medicineAlertRoutes } = await import('../routes/risk.fastify.routes.js');

describe('Medicine Alert API Integration Tests', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(medicineAlertRoutes, { prefix: '/api/medicines' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/medicines/low-stock', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/low-stock' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/expiring', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/expiring' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/out-of-stock', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/out-of-stock' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/critical-alerts', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/critical-alerts' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/expiry-summary', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/expiry-summary' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/reorder-recommendations', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/medicines/reorder-recommendations',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/medicines/alert-trends', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/medicines/alert-trends' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/medicines/alerts/scan', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/medicines/alerts/scan' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe.skip('POST /api/medicines/alerts/:alertId/resolve', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/medicines/alerts/some-id/resolve',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe.skip('POST /api/medicines/alerts/:alertId/snooze', () => {
    it('should return 401 without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/medicines/alerts/some-id/snooze',
        payload: { snoozedUntil: '2026-06-01T00:00:00Z' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
