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

  describe('authController.getPlans', () => {
    it('should return subscription plans from database without requiring authentication', async () => {
      const controllerModule =
        await import('../../../src/modules/auth/controller/auth.fastify.controller.js');
      const authController = controllerModule.default;

      const mockPlans = [
        {
          id: 'free',
          name: 'Free Tier',
          price: 0,
          currency: 'INR',
          billingCycle: 'MONTHLY',
          durationDays: 28,
          isActive: true,
        },
        {
          id: 'paid',
          name: 'Paid Plan',
          price: 599,
          currency: 'INR',
          billingCycle: 'MONTHLY',
          durationDays: 30,
          isActive: true,
        },
      ];

      mockSubscriptionPlanFindMany.mockResolvedValue(mockPlans);

      const mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
      const mockRequest = {
        log: { error: jest.fn() },
      };

      await authController.getPlans(mockRequest, mockReply);

      expect(mockSubscriptionPlanFindMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'free',
              name: 'Free Tier',
              price: 0,
              currency: 'INR',
              billingCycle: 'MONTHLY',
              durationDays: 28,
            }),
            expect.objectContaining({
              id: 'paid',
              name: 'Paid Plan',
              price: 599,
              currency: 'INR',
              billingCycle: 'MONTHLY',
              durationDays: 30,
            }),
          ]),
        }),
      );
    });

    it('should auto-seed plans if database returns empty array and then return seeded plans', async () => {
      const controllerModule =
        await import('../../../src/modules/auth/controller/auth.fastify.controller.js');
      const authController = controllerModule.default;

      mockSubscriptionPlanFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: 'free',
          name: 'Free Tier',
          price: 0,
          currency: 'INR',
          billingCycle: 'MONTHLY',
          durationDays: 28,
          isActive: true,
        },
      ]);
      mockSubscriptionPlanUpsert.mockResolvedValue({ id: 'free' });

      const mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
      const mockRequest = {
        log: { error: jest.fn() },
      };

      await authController.getPlans(mockRequest, mockReply);

      expect(mockSubscriptionPlanFindMany).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionPlanUpsert).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [
            expect.objectContaining({
              id: 'free',
              price: 0,
            }),
          ],
        }),
      );
    });
  });
});
