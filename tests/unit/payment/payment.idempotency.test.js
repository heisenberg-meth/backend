import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockPrismaFindUnique = jest.fn();
const mockPrismaUpsert = jest.fn();

jest.unstable_mockModule('../../../src/config/redis.js', () => ({
  default: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    paymentIdempotency: {
      findUnique: mockPrismaFindUnique,
      upsert: mockPrismaUpsert,
    },
  },
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.lock.service.js', () => ({
  default: {
    executeWithLock: async (key, fn) => fn(),
  },
}));

const { default: idempotencyService } = await import(
  '../../../src/modules/payments/services/payment.idempotency.service.js'
);

describe('PaymentIdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate deterministic hash-based key', () => {
      const key1 = idempotencyService.generateKey('pay', { tenantId: 't1', amount: 100 });
      const key2 = idempotencyService.generateKey('pay', { tenantId: 't1', amount: 100 });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = idempotencyService.generateKey('pay', { tenantId: 't1', amount: 100 });
      const key2 = idempotencyService.generateKey('pay', { tenantId: 't1', amount: 200 });
      expect(key1).not.toBe(key2);
    });
  });

  describe('processIdempotent', () => {
    it('should return cached response if already processed', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({ status: 'processed' }));
      const fn = jest.fn();
      const result = await idempotencyService.processIdempotent('test-key', fn);
      expect(result._replayed).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should execute function and cache result on first call', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPrismaFindUnique.mockResolvedValue(null);
      mockPrismaUpsert.mockResolvedValue({});
      mockRedisSet.mockResolvedValue('OK');

      const fn = jest.fn().mockResolvedValue({ success: true });
      const result = await idempotencyService.processIdempotent('test-key-2', fn);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    it('should detect and return cached from DB on Redis miss', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockPrismaFindUnique.mockResolvedValue({
        idempotencyKey: 'test-key-3',
        response: { status: 'from_db' },
      });
      mockRedisSet.mockResolvedValue('OK');

      const result = await idempotencyService.isProcessed('test-key-3');
      expect(result.status).toBe('from_db');
    });
  });
});
