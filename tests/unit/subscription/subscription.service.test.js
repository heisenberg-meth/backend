import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockSubscriptionPlanFindUnique = jest.fn();
const mockSubscriptionUpsert = jest.fn();
const mockSubscriptionUpdate = jest.fn();
const mockSubscriptionFindUnique = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    subscriptionPlan: { findUnique: mockSubscriptionPlanFindUnique },
    subscription: {
      upsert: mockSubscriptionUpsert,
      update: mockSubscriptionUpdate,
      findUnique: mockSubscriptionFindUnique,
    },
  },
}));

const { default: subscriptionService } = await import(
  '../../../src/modules/subscriptions/subscription.service.js'
);

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create subscription', async () => {
      mockSubscriptionPlanFindUnique.mockResolvedValue({ id: 'plan-1' });
      mockSubscriptionUpsert.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });

      const res = await subscriptionService.createSubscription('tenant-1', 'plan-1', 'monthly');
      expect(res.status).toBe('ACTIVE');
      expect(mockSubscriptionUpsert).toHaveBeenCalled();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription', async () => {
      mockSubscriptionUpdate.mockResolvedValue({
        status: 'CANCELLED',
        autoRenew: false,
      });

      const res = await subscriptionService.cancelSubscription('tenant-1');
      expect(res.status).toBe('CANCELLED');
    });
  });
});
