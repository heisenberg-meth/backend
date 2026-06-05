import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  expiryAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  stockAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  inventoryBatch: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

// Import AFTER mocking
const { default: alertAnalyticsService } = await import('../analytics/alert-analytics.service.js');
const { default: prisma } = await import('../../../config/prisma.js');

describe('AlertAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMostFrequentlyExpiring', () => {
    it('should aggregate expiring medicines by frequency', async () => {
      prisma.expiryAlert.findMany.mockResolvedValue([
        {
          medicineId: 'med-1',
          daysRemaining: 10,
          medicine: { name: 'Amoxicillin', genericName: 'Amoxicillin' },
          batch: { quantity: 50, purchasePrice: 5 },
        },
        {
          medicineId: 'med-1',
          daysRemaining: 15,
          medicine: { name: 'Amoxicillin', genericName: 'Amoxicillin' },
          batch: { quantity: 30, purchasePrice: 5 },
        },
        {
          medicineId: 'med-2',
          daysRemaining: 20,
          medicine: { name: 'Insulin', genericName: 'Insulin' },
          batch: { quantity: 20, purchasePrice: 50 },
        },
      ]);

      const result = await alertAnalyticsService.getMostFrequentlyExpiring('tenant-1');

      expect(result).toHaveLength(2);
      // Service sorts by totalPotentialLoss descending: Insulin=1000, Amoxicillin=400
      expect(result[0].medicineName).toBe('Insulin');
      expect(result[0].expiryCount).toBe(1);
      expect(result[1].medicineName).toBe('Amoxicillin');
      expect(result[1].expiryCount).toBe(2);
    });

    it('should sort by total potential loss', async () => {
      prisma.expiryAlert.findMany.mockResolvedValue([
        {
          medicineId: 'med-1',
          daysRemaining: 10,
          medicine: { name: 'Cheap Med' },
          batch: { quantity: 10, purchasePrice: 1 },
        },
        {
          medicineId: 'med-2',
          daysRemaining: 20,
          medicine: { name: 'Expensive Med' },
          batch: { quantity: 10, purchasePrice: 100 },
        },
      ]);

      const result = await alertAnalyticsService.getMostFrequentlyExpiring('tenant-1');

      expect(result[0].medicineName).toBe('Expensive Med');
      expect(result[0].totalPotentialLoss).toBe(1000);
    });
  });

  describe('getChronicStockOuts', () => {
    it('should identify medicines with repeated stock-outs', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([
        {
          medicineId: 'med-1',
          branchId: 'branch-1',
          medicine: { name: 'Medicine A' },
          createdAt: new Date(),
        },
        {
          medicineId: 'med-1',
          branchId: 'branch-1',
          medicine: { name: 'Medicine A' },
          createdAt: new Date(),
        },
      ]);

      const result = await alertAnalyticsService.getChronicStockOuts('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].medicineId).toBe('med-1');
      expect(result[0].outageCount).toBe(2);
    });

    it('should sort by outage count descending', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([
        {
          medicineId: 'med-1',
          branchId: 'branch-1',
          medicine: { name: 'Rare Outage' },
        },
        {
          medicineId: 'med-2',
          branchId: 'branch-1',
          medicine: { name: 'Frequent Outage' },
        },
        {
          medicineId: 'med-2',
          branchId: 'branch-1',
          medicine: { name: 'Frequent Outage' },
        },
      ]);

      const result = await alertAnalyticsService.getChronicStockOuts('tenant-1');

      expect(result[0].medicineName).toBe('Frequent Outage');
      expect(result[0].outageCount).toBe(2);
    });
  });

  describe('getSupplierExpiryIssues', () => {
    it('should identify suppliers sending low shelf-life batches', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        {
          supplierId: 'sup-1',
          quantity: 50,
          purchasePrice: 10,
          manufacturingDate: new Date('2026-01-01'),
          expiryDate: new Date('2026-06-01'),
          supplier: { name: 'Bad Supplier' },
        },
      ]);

      const result = await alertAnalyticsService.getSupplierExpiryIssues('tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].supplierName).toBe('Bad Supplier');
    });
  });

  describe('getAlertDashboard', () => {
    it('should return comprehensive alert summary', async () => {
      prisma.stockAlert.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5);
      prisma.expiryAlert.count.mockResolvedValue(15);
      prisma.expiryAlert.findMany.mockResolvedValue([]);

      const result = await alertAnalyticsService.getAlertDashboard('tenant-1');

      // Service returns { summary: { lowStock, outOfStock, expiring, critical, totalActiveAlerts }, financialRisk: {...} }
      expect(result.summary.lowStock).toBe(10);
      expect(result.summary.critical).toBe(5);
      expect(result.summary.expiring).toBe(15);
    });
  });

  describe('getAlertHeatmap', () => {
    it('should group alerts by date and type', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([
        { createdAt: new Date('2026-05-01'), type: 'LOW_STOCK', severity: 'WARNING' },
        { createdAt: new Date('2026-05-01'), type: 'OUT_OF_STOCK', severity: 'CRITICAL' },
        { createdAt: new Date('2026-05-02'), type: 'LOW_STOCK', severity: 'WARNING' },
      ]);

      const result = await alertAnalyticsService.getAlertHeatmap('tenant-1');

      // Service returns entries like { date, LOW_STOCK, OUT_OF_STOCK, CRITICAL, EXPIRING }
      const day1 = result.find((d) => d.date === '2026-05-01');
      expect(day1.LOW_STOCK).toBe(1);
      expect(day1.OUT_OF_STOCK).toBe(1);
      expect(day1.CRITICAL).toBe(1);
    });
  });
});
