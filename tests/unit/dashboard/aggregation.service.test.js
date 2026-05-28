import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  sale: {
    aggregate: jest.fn(),
  },
  dailySalesSummary: {
    findFirst: jest.fn(),
  },
  paymentMethodAnalytics: {
    findMany: jest.fn(),
  },
  saleItem: {
    groupBy: jest.fn(),
  },
  medicine: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  stockAlert: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  inventoryBatch: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  purchaseOrder: {
    count: jest.fn(),
  },
  dashboardSnapshot: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../../src/config/redis.js', () => ({ default: mockRedisClient }));
jest.unstable_mockModule('../../../src/shared/utils/logger.js', () => ({ default: mockLogger }));

const { default: dashboardAggregationService } = await import('../../../src/modules/dashboard/aggregations/dashboard.aggregation.service.js');

describe('DashboardAggregationService', () => {
  const tenantId = 'tenant-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOverview', () => {
    it('should return cached overview if available', async () => {
      const cached = { todayRevenue: 1000, todayInvoices: 50 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cached));

      const result = await dashboardAggregationService.getOverview(tenantId);

      expect(result).toEqual(cached);
    });

    it('should compute overview if cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.dashboardSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.sale.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 5000 }, _count: { id: 25 } })
        .mockResolvedValueOnce({ _sum: { totalAmount: 150000 }, _count: { id: 500 } });
      mockPrisma.stockAlert.count.mockResolvedValue(10);
      mockPrisma.inventoryBatch.count.mockResolvedValue(5);
      mockPrisma.purchaseOrder.count.mockResolvedValue(3);
      mockPrisma.saleItem.groupBy.mockResolvedValue([{ medicineId: 'med-1', _sum: { quantity: 100 } }]);
      mockPrisma.medicine.findFirst.mockResolvedValue({ name: 'Paracetamol' });

      const result = await dashboardAggregationService.getOverview(tenantId);

      expect(result.todayRevenue).toBe(5000);
      expect(result.todayInvoices).toBe(25);
      expect(result.lowStockCount).toBe(10);
      expect(result.expiringMedicines).toBe(5);
      expect(result.pendingPurchaseOrders).toBe(3);
      expect(result.topSellingMedicine).toBe('Paracetamol');
    });

    it('should reject access for unauthorized roles', async () => {
      await expect(
        dashboardAggregationService.getOverview(tenantId, null, 'VIEWER')
      ).rejects.toThrow('Insufficient permissions');
    });
  });

  describe('getSalesSummary', () => {
    it('should use daily sales summary if available', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.dashboardSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.dailySalesSummary.findFirst.mockResolvedValue({
        totalSales: 10000,
        totalInvoices: 50,
        totalItemsSold: 200,
        totalDiscount: 500,
        totalGst: 1200,
        cashSales: 3000,
        cardSales: 2000,
        upiSales: 5000,
      });
      mockPrisma.paymentMethodAnalytics.findMany.mockResolvedValue([]);
      mockPrisma.saleItem.groupBy.mockResolvedValue([]);

      const result = await dashboardAggregationService.getSalesSummary(tenantId);

      expect(result.revenue).toBe(10000);
      expect(result.invoiceCount).toBe(50);
      expect(result.itemsSold).toBe(200);
      expect(result.paymentMethods.cash).toBe(3000);
      expect(result.paymentMethods.upi).toBe(5000);
    });

    it('should fall back to live aggregation if no daily summary', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.dashboardSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.dailySalesSummary.findFirst.mockResolvedValue(null);
      mockPrisma.sale.aggregate
        .mockResolvedValueOnce({ _sum: { totalAmount: 5000 }, _count: { id: 25 } })
        .mockResolvedValueOnce({ _sum: { totalAmount: 150000 }, _count: { id: 500 } });
      mockPrisma.paymentMethodAnalytics.findMany.mockResolvedValue([]);
      mockPrisma.saleItem.groupBy.mockResolvedValue([]);

      const result = await dashboardAggregationService.getSalesSummary(tenantId);

      expect(result.todaySales.total).toBe(5000);
      expect(result.todaySales.count).toBe(25);
      expect(result.monthSales.total).toBe(150000);
    });
  });

  describe('getInventoryHealth', () => {
    it('should calculate healthy stock percentage', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.dashboardSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.inventoryBatch.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(10);
      mockPrisma.inventoryBatch.aggregate.mockResolvedValue({ _sum: { quantity: 5000 } });
      mockPrisma.medicine.count.mockResolvedValue(8);
      mockPrisma.stockAlert.count.mockResolvedValue(15);

      const result = await dashboardAggregationService.getInventoryHealth(tenantId);

      expect(result.totalStock).toBe(5000);
      expect(result.expiredCount).toBe(5);
      expect(result.expiringSoonCount).toBe(10);
      expect(result.outOfStockCount).toBe(8);
      expect(result.lowStockCount).toBe(15);
    });
  });

  describe('getAlerts', () => {
    it('should return severity-ranked alerts', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.dashboardSnapshot.findFirst.mockResolvedValue(null);
      mockPrisma.stockAlert.findMany.mockResolvedValue([
        { id: 'alert-1', severity: 'CRITICAL', message: 'Critical alert', medicine: { id: 'med-1', name: 'Medicine A' }, type: 'LOW_STOCK', createdAt: new Date() },
        { id: 'alert-2', severity: 'LOW', message: 'Low alert', medicine: { id: 'med-2', name: 'Medicine B' }, type: 'LOW_STOCK', createdAt: new Date() },
      ]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        { id: 'batch-1', batchNumber: 'B001', quantity: 10, expiryDate: new Date('2024-01-01'), purchasePrice: 50, medicine: { id: 'med-3', name: 'Expired Med' } },
      ]);

      const result = await dashboardAggregationService.getAlerts(tenantId);

      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.warnings).toBe(1);
      expect(result.summary.info).toBe(1);
    });
  });
});
