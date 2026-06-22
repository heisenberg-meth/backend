import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPaymentSessionCreate = jest.fn();
const mockPaymentSessionFindUnique = jest.fn();
const mockPaymentSessionFindFirst = jest.fn();
const mockPaymentSessionUpdate = jest.fn();
const mockSubscriptionPlanFindUnique = jest.fn();
const mockTransactionFindFirst = jest.fn();
const mockRazorpayOrdersCreate = jest.fn();
const mockAuditLogCreate = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    paymentSession: {
      create: mockPaymentSessionCreate,
      findUnique: mockPaymentSessionFindUnique,
      findFirst: mockPaymentSessionFindFirst,
      update: mockPaymentSessionUpdate,
    },
    subscriptionPlan: {
      findUnique: mockSubscriptionPlanFindUnique,
    },
    transaction: {
      findFirst: mockTransactionFindFirst,
    },
    auditLog: {
      create: mockAuditLogCreate,
    },
  },
}));

jest.unstable_mockModule('../../../src/config/razorpay.js', () => ({
  default: {
    orders: {
      create: mockRazorpayOrdersCreate,
    },
  },
}));

jest.unstable_mockModule('../../../src/modules/subscriptions/subscription.service.js', () => ({
  default: {
    createSubscription: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../src/modules/subscriptions/payment-session-audit.service.js', () => ({
  default: {
    logCheckoutCreated: jest.fn(),
    logPaymentSuccess: jest.fn(),
    logPaymentFailed: jest.fn(),
    logPaymentExpired: jest.fn(),
    logSubscriptionActivated: jest.fn(),
    logWebhookReceived: jest.fn(),
    logSignatureVerificationFailed: jest.fn(),
    logStateMismatch: jest.fn(),
  },
}));

const { default: paymentSessionService } = await import(
  '../../../src/modules/subscriptions/payment-session.service.js'
);

describe('PaymentSession Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session', async () => {
      mockSubscriptionPlanFindUnique.mockResolvedValue({
        id: 'plan-1',
        price: 999,
        name: 'Pro Plan',
      });
      mockRazorpayOrdersCreate.mockResolvedValue({
        id: 'order_test123',
        amount: 99900,
        currency: 'INR',
      });
      mockPaymentSessionCreate.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        status: 'PENDING',
      });

      const result = await paymentSessionService.createCheckoutSession(
        'tenant-1',
        'user-1',
        'plan-1',
        'monthly',
      );

      expect(result).toHaveProperty('paymentSessionId');
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('orderId', 'order_test123');
      expect(result).toHaveProperty('amount', 99900);
      expect(mockPaymentSessionCreate).toHaveBeenCalled();
    });

    it('should throw error if plan not found', async () => {
      mockSubscriptionPlanFindUnique.mockResolvedValue(null);

      await expect(
        paymentSessionService.createCheckoutSession('tenant-1', 'user-1', 'invalid-plan', 'monthly'),
      ).rejects.toThrow('Subscription plan not found');
    });

    it('should calculate yearly amount correctly', async () => {
      mockSubscriptionPlanFindUnique.mockResolvedValue({
        id: 'plan-1',
        price: 999,
        name: 'Pro Plan',
      });
      mockRazorpayOrdersCreate.mockResolvedValue({
        id: 'order_test123',
        amount: 1198800,
        currency: 'INR',
      });
      mockPaymentSessionCreate.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        status: 'PENDING',
      });

      const result = await paymentSessionService.createCheckoutSession(
        'tenant-1',
        'user-1',
        'plan-1',
        'yearly',
      );

      expect(result.amount).toBe(1198800);
    });
  });

  describe('validateSession', () => {
    it('should validate session with correct state', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);

      mockPaymentSessionFindUnique.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        state: 'valid-state',
        status: 'PENDING',
        expiresAt: futureDate,
        tenantId: 'tenant-1',
      });

      const result = await paymentSessionService.validateSession('test-uuid', 'valid-state');
      expect(result.id).toBe('session-1');
    });

    it('should throw error if state mismatch', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);

      mockPaymentSessionFindUnique.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        state: 'valid-state',
        status: 'PENDING',
        expiresAt: futureDate,
        tenantId: 'tenant-1',
      });

      await expect(
        paymentSessionService.validateSession('test-uuid', 'wrong-state'),
      ).rejects.toThrow('Invalid state parameter');
    });

    it('should throw error if session expired', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 30);

      mockPaymentSessionFindUnique.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        state: 'valid-state',
        status: 'PENDING',
        expiresAt: pastDate,
        tenantId: 'tenant-1',
      });
      mockPaymentSessionUpdate.mockResolvedValue({});

      await expect(
        paymentSessionService.validateSession('test-uuid', 'valid-state'),
      ).rejects.toThrow('Payment session expired');
    });

    it('should throw error if session already processed', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 30);

      mockPaymentSessionFindUnique.mockResolvedValue({
        id: 'session-1',
        paymentSessionId: 'test-uuid',
        state: 'valid-state',
        status: 'PAYMENT_SUCCESS',
        expiresAt: futureDate,
        tenantId: 'tenant-1',
      });

      await expect(
        paymentSessionService.validateSession('test-uuid', 'valid-state'),
      ).rejects.toThrow('Payment session already processed');
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status', async () => {
      mockPaymentSessionFindUnique.mockResolvedValue({
        paymentSessionId: 'test-uuid',
        status: 'PENDING',
        amount: 999,
        currency: 'INR',
        createdAt: new Date(),
        expiresAt: new Date(),
        subscriptionPlan: { name: 'Pro Plan' },
      });

      const result = await paymentSessionService.getPaymentStatus('test-uuid');
      expect(result.status).toBe('PENDING');
      expect(result.planName).toBe('Pro Plan');
    });

    it('should throw error if session not found', async () => {
      mockPaymentSessionFindUnique.mockResolvedValue(null);

      await expect(
        paymentSessionService.getPaymentStatus('invalid-uuid'),
      ).rejects.toThrow('Payment session not found');
    });
  });
});
