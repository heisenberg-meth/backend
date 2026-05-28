import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockPaymentFindMany = jest.fn();
const mockPaymentFindUnique = jest.fn();
const mockPaymentFindFirst = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockAuditLogCreate = jest.fn();
const mockRazorpayOrdersFetch = jest.fn();
const mockRazorpayPaymentsAll = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    payment: {
      findMany: mockPaymentFindMany,
      findUnique: mockPaymentFindUnique,
      findFirst: mockPaymentFindFirst,
      update: mockPaymentUpdate,
    },
    paymentAuditLog: {
      create: mockAuditLogCreate,
    },
    paymentRecovery: {
      create: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../../../src/config/razorpay.js', () => ({
  default: {
    orders: { fetch: mockRazorpayOrdersFetch },
    payments: { all: mockRazorpayPaymentsAll },
  },
  healthCheck: jest.fn(),
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.lock.service.js', () => ({
  default: {
    executeWithLock: async (key, fn) => fn(),
  },
}));

jest.unstable_mockModule('../../../src/modules/payments/services/payment.orchestrator.service.js', () => ({
  default: {
    _transitionPayment: jest.fn().mockResolvedValue({}),
    recoverPayment: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../../src/shared/services/eventbus.service.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../../src/shared/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: recoveryService } = await import(
  '../../../src/modules/payments/services/payment.recovery.service.js'
);

describe('PaymentRecoveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recoverOrphanedPayments', () => {
    it('should find and recover orphaned payments', async () => {
      const orphanPayment = {
        id: 'pay_1',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_123',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      };

      mockPaymentFindMany.mockResolvedValue([orphanPayment]);
      mockPaymentFindUnique.mockResolvedValue(orphanPayment);
      mockRazorpayOrdersFetch.mockResolvedValue({ status: 'paid', id: 'order_123' });
      mockRazorpayPaymentsAll.mockResolvedValue({
        items: [{ id: 'pay_123', status: 'captured', created_at: Math.floor(Date.now() / 1000) }],
      });
      mockPaymentUpdate.mockResolvedValue({});

      const result = await recoveryService.recoverOrphanedPayments();
      expect(result.recovered).toBeGreaterThan(0);
    });

    it('should mark failed if gateway says failed', async () => {
      const orphanPayment = {
        id: 'pay_2',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_456',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      };

      mockPaymentFindMany.mockResolvedValue([orphanPayment]);
      mockPaymentFindUnique.mockResolvedValue(orphanPayment);
      mockRazorpayOrdersFetch.mockResolvedValue({ status: 'failed' });

      const result = await recoveryService.recoverOrphanedPayments();
      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('detectStuckPayments', () => {
    it('should expire payments stuck for over 1 hour', async () => {
      const stuckPayment = {
        id: 'pay_3',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_789',
        status: 'PENDING',
        razorpayPaymentId: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      };

      mockPaymentFindMany.mockResolvedValue([stuckPayment]);
      mockPaymentUpdate.mockResolvedValue(stuckPayment);

      const count = await recoveryService.detectStuckPayments();
      expect(count).toBe(1);
      expect(mockPaymentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EXPIRED' } })
      );
    });
  });

  describe('recoverPaymentSession', () => {
    it('should return completed for successful payments', async () => {
      mockPaymentFindFirst.mockResolvedValue({
        id: 'pay_4',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_111',
        razorpayPaymentId: 'pay_111',
        status: 'SUCCESS',
        amount: 100,
      });

      const result = await recoveryService.recoverPaymentSession('tenant-1', 'order_111');
      expect(result.status).toBe('completed');
    });

    it('should try to recover pending payments', async () => {
      mockPaymentFindFirst.mockResolvedValue({
        id: 'pay_5',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_222',
        status: 'PENDING',
        amount: 100,
      });

      mockRazorpayOrdersFetch.mockResolvedValue({ status: 'paid' });
      mockRazorpayPaymentsAll.mockResolvedValue({
        items: [{ id: 'pay_222', status: 'captured', created_at: Math.floor(Date.now() / 1000) }],
      });
      mockPaymentFindUnique.mockResolvedValue({
        id: 'pay_5',
        tenantId: 'tenant-1',
        razorpayOrderId: 'order_222',
        status: 'PENDING',
      });
      mockPaymentUpdate.mockResolvedValue({});

      const result = await recoveryService.recoverPaymentSession('tenant-1', 'order_222');
      expect(result.status).toBe('recovered');
    });
  });
});
