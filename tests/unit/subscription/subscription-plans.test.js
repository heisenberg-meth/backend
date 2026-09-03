import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../src/config/prisma.js');
const seedPath = path.resolve(__dirname, '../../../prisma/seed.js');

const mockSubscriptionPlanUpsert = jest.fn();
const mockSubscriptionPlanFindMany = jest.fn();

jest.unstable_mockModule(prismaPath, () => ({
  default: {
    subscriptionPlan: {
      upsert: mockSubscriptionPlanUpsert,
      findMany: mockSubscriptionPlanFindMany,
    },
  },
}));

const { seedSubscriptionPlans } = await import(seedPath);

describe('Subscription Plans Seeding & API Standardization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('seedSubscriptionPlans', () => {
    it('should upsert free and paid subscription plans idempotently', async () => {
      mockSubscriptionPlanUpsert.mockResolvedValue({ id: 'free' });

      const plans = await seedSubscriptionPlans();

      expect(mockSubscriptionPlanUpsert).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionPlanUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'free' },
          create: expect.objectContaining({
            id: 'free',
            name: 'Free Tier',
            price: 0,
            durationDays: 28,
            isActive: true,
          }),
        }),
      );

      expect(mockSubscriptionPlanUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'paid' },
          create: expect.objectContaining({
            id: 'paid',
            name: 'Paid Plan',
            price: 599,
            durationDays: 30,
            isActive: true,
          }),
        }),
      );

      expect(plans).toHaveProperty('freePlan');
      expect(plans).toHaveProperty('paidPlan');
    });
  });
});
