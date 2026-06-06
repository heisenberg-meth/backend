import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  dailySalesSummary: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  paymentMethodAnalytics: {
    findMany: jest.fn(),
  },
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  setex: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedisClient,
  quitRedis: jest.fn(),
  getBullRedis: jest.fn(),
  initRedis: jest.fn(),
}));

const { default: dashboardService } =
  await import('../../src/modules/billing-analytics/services/dashboard.service.js');

describe('DashboardService Billing Analytics Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailySummary', () => {
    const tenantId = 'tenant-1';
    const date = '2026-06-06';

    it('should query specific branch daily summary if branchId is provided', async () => {
      const branchId = 'branch-1';
      const mockResult = {
        salesDate: new Date(date),
        totalSales: 500,
        totalInvoices: 10,
        totalReturns: 50,
        totalGst: 40,
      };

      mockPrisma.dailySalesSummary.findUnique.mockResolvedValue(mockResult);

      const result = await dashboardService.getDailySummary(tenantId, branchId, date);

      expect(mockPrisma.dailySalesSummary.findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_branchId_salesDate: {
            tenantId,
            branchId,
            salesDate: expect.any(Date),
          },
        },
      });
      expect(result.summary.totalSales).toBe(500);
      expect(result.summary.netRevenue).toBe(450);
    });

    it('should aggregate tenant-level summaries if branchId is null/undefined', async () => {
      const mockResults = [
        { totalSales: 300, totalInvoices: 5, totalReturns: 30, totalGst: 20 },
        { totalSales: 400, totalInvoices: 7, totalReturns: 20, totalGst: 30 },
      ];

      mockPrisma.dailySalesSummary.findMany.mockResolvedValue(mockResults);

      const result = await dashboardService.getDailySummary(tenantId, null, date);

      expect(mockPrisma.dailySalesSummary.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          salesDate: expect.any(Date),
        },
      });
      expect(result.summary.totalSales).toBe(700);
      expect(result.summary.totalInvoices).toBe(12);
      expect(result.summary.netRevenue).toBe(650);
      expect(result.taxSummary.totalGst).toBe(50);
    });
  });

  describe('getPaymentBreakdown', () => {
    const tenantId = 'tenant-1';
    const date = '2026-06-06';

    it('should filter by branchId when provided', async () => {
      const branchId = 'branch-1';
      mockPrisma.paymentMethodAnalytics.findMany.mockResolvedValue([
        { paymentMethod: 'CASH', totalAmount: 100, totalCount: 2 },
        { paymentMethod: 'UPI', totalAmount: 200, totalCount: 3 },
      ]);

      const result = await dashboardService.getPaymentBreakdown(tenantId, branchId, date);

      expect(mockPrisma.paymentMethodAnalytics.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          branchId,
          paymentDate: expect.any(Date),
        },
      });
      expect(result.totalRevenue).toBe(300);
    });

    it('should aggregate payments at tenant level when branchId is null', async () => {
      mockPrisma.paymentMethodAnalytics.findMany.mockResolvedValue([
        { paymentMethod: 'CASH', totalAmount: 100, totalCount: 2 },
        { paymentMethod: 'CASH', totalAmount: 150, totalCount: 3 },
        { paymentMethod: 'UPI', totalAmount: 200, totalCount: 3 },
      ]);

      const result = await dashboardService.getPaymentBreakdown(tenantId, null, date);

      expect(mockPrisma.paymentMethodAnalytics.findMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          paymentDate: expect.any(Date),
        },
      });
      expect(result.totalRevenue).toBe(450);
      const cashPayment = result.payments.find((p) => p.method === 'CASH');
      expect(cashPayment.amount).toBe(250);
      expect(cashPayment.count).toBe(5);
    });
  });
});
