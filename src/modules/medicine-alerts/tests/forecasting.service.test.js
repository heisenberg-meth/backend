import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';

const mockPrisma = {
  medicine: {
    findUnique: jest.fn(),
  },
  invoiceItem: {
    aggregate: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

let forecastingService;

beforeAll(async () => {
  const mod = await import('../forecasting/forecasting.service.js');
  forecastingService = mod.default;
});

describe('ForecastingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('predictDaysRemaining', () => {
    it('should calculate days remaining using ADU formula', async () => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 300 } });

      const result = await forecastingService.predictDaysRemaining(
        'med-1',
        'tenant-1',
        'branch-1',
        60,
      );

      expect(result).toBe(6);
    });

    it('should return 999 for zero-demand medicines', async () => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      const result = await forecastingService.predictDaysRemaining(
        'med-1',
        'tenant-1',
        'branch-1',
        50,
      );

      expect(result).toBe(999);
    });

    it('should handle high consumption rate', async () => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 900 } });

      const result = await forecastingService.predictDaysRemaining('med-1', 'tenant-1', null, 15);

      expect(result).toBe(0);
    });
  });

  describe('getReorderRecommendations', () => {
    it('should generate reorder quantity using (ADU * Lead Time) + Safety Stock', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        reorderLevel: 20,
        medicineSuppliers: [{ leadDays: 7 }],
      });

      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 300 } });

      const result = await forecastingService.getReorderRecommendations(
        'med-1',
        'tenant-1',
        'branch-1',
      );

      const adu = 300 / 30;
      const leadTime = 7;
      const safetyStock = Math.ceil(adu * leadTime * 0.5);
      const expectedQty = Math.ceil(adu * leadTime + safetyStock);

      expect(result.averageDailyUsage).toBe(10);
      expect(result.leadTime).toBe(7);
      expect(result.recommendedOrderQuantity).toBe(Math.max(20, expectedQty));
    });

    it('should use default lead time when no preferred supplier', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Generic Med',
        reorderLevel: 10,
        medicineSuppliers: [],
      });

      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 150 } });

      const result = await forecastingService.getReorderRecommendations('med-1', 'tenant-1');

      expect(result.leadTime).toBe(7);
    });

    it('should return null when medicine not found', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue(null);

      const result = await forecastingService.getReorderRecommendations('invalid', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('_calculateAverageDailyUsage', () => {
    it('should calculate ADU from last 30 days of invoice items', async () => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 600 } });

      const result = await forecastingService._calculateAverageDailyUsage(
        'med-1',
        'tenant-1',
        'branch-1',
      );

      expect(result).toBe(20);
    });

    it('should return 0 when no sales exist', async () => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: null } });

      const result = await forecastingService._calculateAverageDailyUsage('med-1', 'tenant-1');

      expect(result).toBe(0);
    });
  });
});
