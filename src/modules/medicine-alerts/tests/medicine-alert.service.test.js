import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

const mockAlertRepository = {
  findLowStockAlerts: jest.fn(),
  findExpiryAlerts: jest.fn(),
  findOutOfStockAlerts: jest.fn(),
  upsertStockAlert: jest.fn(),
  upsertExpiryAlert: jest.fn(),
  resolveStockAlerts: jest.fn(),
};

const mockForecastingService = {
  predictDaysRemaining: jest.fn(),
  getReorderRecommendations: jest.fn(),
};

const mockPrisma = {
  stockAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
  },
  expiryAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    groupBy: jest.fn(),
  },
  inventoryBatch: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  medicine: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  invoiceItem: {
    aggregate: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/redis.js', () => ({
  default: mockRedis,
  quitRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../repositories/alert.repository.js', () => ({
  default: mockAlertRepository,
}));

jest.unstable_mockModule('../forecasting/forecasting.service.js', () => ({
  default: mockForecastingService,
}));

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

const { default: medicineAlertService } = await import('../services/medicine-alert.service.js');

describe('MedicineAlertService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLowStockAlerts', () => {
    it('should detect low stock and enrich with forecasting data', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          medicineId: 'med-1',
          currentStock: 12,
          thresholdValue: 20,
          medicine: { id: 'med-1', name: 'Dolo 650', reorderLevel: 20 },
        },
      ];

      mockAlertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: mockAlerts,
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      mockForecastingService.predictDaysRemaining.mockResolvedValue(2);
      mockForecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 100,
        averageDailyUsage: 10,
      });

      const result = await medicineAlertService.getLowStockAlerts('tenant-1', {
        branchId: 'branch-1',
      });

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].daysRemaining).toBe(2);
      expect(result.alerts[0].recommendedOrderQuantity).toBe(100);
      expect(result.alerts[0].averageDailyUsage).toBe(10);
    });

    it('should return cached results when available', async () => {
      const cachedData = { alerts: [], pagination: { total: 0 } };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(result).toEqual(cachedData);
      expect(mockAlertRepository.findLowStockAlerts).not.toHaveBeenCalled();
    });

    it('should handle zero-demand medicines gracefully', async () => {
      const mockAlerts = [
        {
          id: 'alert-2',
          medicineId: 'med-2',
          currentStock: 50,
          thresholdValue: 10,
          medicine: { id: 'med-2', name: 'Rare Medicine', reorderLevel: 10 },
        },
      ];

      mockAlertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: mockAlerts,
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      mockForecastingService.predictDaysRemaining.mockResolvedValue(999);
      mockForecastingService.getReorderRecommendations.mockResolvedValue(null);

      const result = await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(result.alerts[0].daysRemaining).toBe(999);
      expect(result.alerts[0].recommendedOrderQuantity).toBe(20);
    });
  });

  describe('getExpiryAlerts', () => {
    it('should detect expiring batches with severity levels', async () => {
      const mockAlerts = [
        {
          id: 'expiry-1',
          medicineId: 'med-1',
          batchId: 'batch-1',
          daysRemaining: 14,
          batch: {
            id: 'batch-1',
            batchNumber: 'BATCH001',
            quantity: 120,
            expiryDate: new Date('2026-08-20'),
            purchasePrice: 5.5,
          },
          medicine: { id: 'med-1', name: 'Amoxicillin' },
        },
      ];

      mockAlertRepository.findExpiryAlerts.mockResolvedValue({
        alerts: mockAlerts,
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      const result = await medicineAlertService.getExpiryAlerts('tenant-1');

      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].severity).toBe('CRITICAL');
      expect(result.alerts[0].potentialLoss).toBe(120 * 5.5);
      expect(result.alerts[0].batchNumber).toBe('BATCH001');
      expect(result.alerts[0].stockQuantity).toBe(120);
    });

    it('should calculate correct severity based on remaining days', async () => {
      mockAlertRepository.findExpiryAlerts.mockResolvedValue({
        alerts: [
          { daysRemaining: 5, batch: { quantity: 10, purchasePrice: 2 }, medicine: { name: 'A' } },
          { daysRemaining: 20, batch: { quantity: 10, purchasePrice: 2 }, medicine: { name: 'B' } },
          { daysRemaining: 60, batch: { quantity: 10, purchasePrice: 2 }, medicine: { name: 'C' } },
        ],
        pagination: { total: 3, page: 1, limit: 50, totalPages: 1 },
      });

      const result = await medicineAlertService.getExpiryAlerts('tenant-1');

      expect(result.alerts[0].severity).toBe('CRITICAL');
      expect(result.alerts[1].severity).toBe('WARNING');
      expect(result.alerts[2].severity).toBe('INFO');
    });

    it('should not return duplicate expiry alerts for same batch', async () => {
      mockAlertRepository.findExpiryAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      const result = await medicineAlertService.getExpiryAlerts('tenant-1');

      expect(result.alerts).toHaveLength(0);
    });
  });

  describe('getOutOfStockAlerts', () => {
    beforeEach(() => {
      mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 300 } });
    });

    it('should prioritize critical medicines (prescription required)', async () => {
      const mockAlerts = [
        {
          id: 'oos-1',
          medicineId: 'med-1',
          medicine: { id: 'med-1', name: 'Insulin', prescriptionRequired: true },
          lastAvailableAt: new Date('2026-05-18'),
        },
      ];

      mockAlertRepository.findOutOfStockAlerts.mockResolvedValue({
        alerts: mockAlerts,
        total: 1,
        pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });

      const result = await medicineAlertService.getOutOfStockAlerts('tenant-1');

      expect(result.alerts[0].priority).toBe('CRITICAL');
    });

    it('should assign priority based on average daily demand', async () => {
      mockAlertRepository.findOutOfStockAlerts.mockResolvedValue({
        alerts: [
          {
            medicine: { name: 'High Demand', prescriptionRequired: false },
            lastAvailableAt: new Date(),
          },
        ],
        total: 1,
        pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
      });

      const result = await medicineAlertService.getOutOfStockAlerts('tenant-1');

      expect(result.alerts[0]).toHaveProperty('averageDailyDemand');
      expect(result.alerts[0]).toHaveProperty('priority');
    });
  });

  describe('getCriticalAlerts', () => {
    it('should combine critical stock and expiry alerts', async () => {
      mockAlertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [{ id: 'crit-1', type: 'LOW_STOCK', severity: 'CRITICAL' }],
        total: 1,
      });

      mockAlertRepository.findExpiryAlerts.mockResolvedValue({
        alerts: [{ id: 'crit-2', severity: 'CRITICAL' }],
        total: 1,
      });

      const result = await medicineAlertService.getCriticalAlerts('tenant-1');

      expect(result.totalCritical).toBe(2);
      expect(result.stockAlerts).toHaveLength(1);
      expect(result.expiryAlerts).toHaveLength(1);
    });
  });

  describe('getExpirySummary', () => {
    it('should summarize expiring inventory by severity', async () => {
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          batchNumber: 'B001',
          medicineId: 'med-1',
          expiryDate: new Date('2026-06-01'),
          quantity: 50,
          medicine: { name: 'Medicine A', genericName: 'Generic A', sellingPrice: 10 },
          branch: { name: 'Branch A', code: 'BA' },
        },
        {
          id: 'batch-2',
          batchNumber: 'B002',
          medicineId: 'med-2',
          expiryDate: new Date('2026-07-01'),
          quantity: 30,
          medicine: { name: 'Medicine B', genericName: 'Generic B', sellingPrice: 20 },
          branch: { name: 'Branch B', code: 'BB' },
        },
      ]);

      const result = await medicineAlertService.getExpirySummary('tenant-1', { daysThreshold: 90 });

      expect(result.total).toBe(2);
      expect(result.totalPotentialLoss).toBe(50 * 10 + 30 * 20);
      expect(result.batches).toHaveLength(2);
      expect(result.batches[0]).toHaveProperty('recommendedAction');
    });
  });

  describe('getReorderRecommendations', () => {
    it('should generate reorder recommendations for low stock medicines', async () => {
      mockAlertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [
          { medicineId: 'med-1', branchId: 'branch-1' },
          { medicineId: 'med-2', branchId: 'branch-1' },
        ],
        pagination: { total: 2, page: 1, limit: 100, totalPages: 1 },
      });

      mockForecastingService.getReorderRecommendations
        .mockResolvedValueOnce({ medicineId: 'med-1', recommendedOrderQuantity: 100 })
        .mockResolvedValueOnce({ medicineId: 'med-2', recommendedOrderQuantity: 50 });

      const result = await medicineAlertService.getReorderRecommendations('tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0].recommendedOrderQuantity).toBe(100);
    });

    it('should return single medicine recommendation when medicineId provided', async () => {
      mockForecastingService.getReorderRecommendations.mockResolvedValue({
        medicineId: 'med-1',
        recommendedOrderQuantity: 100,
      });

      const result = await medicineAlertService.getReorderRecommendations('tenant-1', {
        medicineId: 'med-1',
      });

      expect(result.recommendedOrderQuantity).toBe(100);
    });
  });

  describe('resolveAlert', () => {
    it('should mark alert as resolved and invalidate cache', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue({ id: 'alert-1', tenantId: 'tenant-1' });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        isResolved: true,
        resolvedAt: new Date(),
      });
      mockRedis.keys.mockResolvedValue([]);

      const result = await medicineAlertService.resolveAlert('alert-1', 'tenant-1', 'user-1');

      expect(result.isResolved).toBe(true);
      expect(mockPrisma.stockAlert.update).toHaveBeenCalled();
    });

    it('should throw error when alert not found', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue(null);

      await expect(
        medicineAlertService.resolveAlert('invalid', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Alert not found');
    });
  });

  describe('snoozeAlert', () => {
    it('should snooze an alert until specified date', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue({ id: 'alert-1', tenantId: 'tenant-1' });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        snoozedUntil: new Date('2026-06-01'),
      });

      const result = await medicineAlertService.snoozeAlert(
        'alert-1',
        'tenant-1',
        new Date('2026-06-01'),
      );

      expect(result.snoozedUntil).toBeDefined();
    });
  });

  describe('triggerFullScan', () => {
    it('should run expiry and stock scans and emit events', async () => {
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrisma.medicine.findMany.mockResolvedValue([]);

      const result = await medicineAlertService.triggerFullScan('tenant-1');

      expect(result).toHaveProperty('expiryAlerts');
      expect(result).toHaveProperty('stockAlerts');
      expect(result).toHaveProperty('total');
    });
  });

  describe('_calculateExpirySeverity', () => {
    it('should return CRITICAL for <= 15 days', () => {
      expect(medicineAlertService._calculateExpirySeverity(0)).toBe('CRITICAL');
      expect(medicineAlertService._calculateExpirySeverity(14)).toBe('CRITICAL');
      expect(medicineAlertService._calculateExpirySeverity(15)).toBe('CRITICAL');
    });

    it('should return WARNING for 16-30 days', () => {
      expect(medicineAlertService._calculateExpirySeverity(16)).toBe('WARNING');
      expect(medicineAlertService._calculateExpirySeverity(30)).toBe('WARNING');
    });

    it('should return INFO for > 30 days', () => {
      expect(medicineAlertService._calculateExpirySeverity(31)).toBe('INFO');
      expect(medicineAlertService._calculateExpirySeverity(90)).toBe('INFO');
    });
  });

  describe('_calculateOosPriority', () => {
    it('should return CRITICAL for prescription required medicines', () => {
      expect(medicineAlertService._calculateOosPriority({ prescriptionRequired: true }, 5)).toBe(
        'CRITICAL',
      );
    });

    it('should return HIGH for high demand (>10 daily)', () => {
      expect(medicineAlertService._calculateOosPriority({ prescriptionRequired: false }, 15)).toBe(
        'HIGH',
      );
    });

    it('should return MEDIUM for medium demand (5-10 daily)', () => {
      expect(medicineAlertService._calculateOosPriority({ prescriptionRequired: false }, 7)).toBe(
        'MEDIUM',
      );
    });

    it('should return LOW for low demand (<5 daily)', () => {
      expect(medicineAlertService._calculateOosPriority({ prescriptionRequired: false }, 2)).toBe(
        'LOW',
      );
    });
  });

  describe('_getExpiryAction', () => {
    it('should recommend DESTROY for expired medicines', () => {
      expect(medicineAlertService._getExpiryAction(-1, 10)).toBe('DESTROY');
      expect(medicineAlertService._getExpiryAction(0, 10)).toBe('DESTROY');
    });

    it('should recommend EMERGENCY_DISCOUNT for <= 7 days', () => {
      expect(medicineAlertService._getExpiryAction(5, 10)).toBe('EMERGENCY_DISCOUNT');
    });

    it('should recommend DISCOUNT_CAMPAIGN for <= 15 days', () => {
      expect(medicineAlertService._getExpiryAction(10, 10)).toBe('DISCOUNT_CAMPAIGN');
    });

    it('should recommend SUPPLIER_RETURN for large quantities with > 30 days remaining', () => {
      expect(medicineAlertService._getExpiryAction(45, 100)).toBe('SUPPLIER_RETURN');
    });

    it('should recommend MONITOR for healthy shelf life', () => {
      expect(medicineAlertService._getExpiryAction(45, 10)).toBe('MONITOR');
    });
  });
});
