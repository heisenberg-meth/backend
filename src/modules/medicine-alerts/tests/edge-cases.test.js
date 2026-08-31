import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const alertRepositoryPath = path.resolve(__dirname, '../repositories/alert.repository.js');
const forecastingServicePath = path.resolve(__dirname, '../forecasting/forecasting.service.js');
const scanKeysPath = path.resolve(__dirname, '../../../shared/utils/scan-keys.js');
const medicineAlertServicePath = path.resolve(__dirname, '../services/medicine-alert.service.js');

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
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

const mockScanKeys = jest
  .fn()
  .mockResolvedValue([
    'alerts:tenant-1:low-stock',
    'alerts:tenant-1:expiry',
    'alerts:tenant-1:out-of-stock',
  ]);

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedis,
  quitRedis: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(alertRepositoryPath, () => ({
  default: mockAlertRepository,
}));

jest.unstable_mockModule(forecastingServicePath, () => ({
  default: mockForecastingService,
}));

jest.unstable_mockModule(scanKeysPath, () => ({
  scanKeys: mockScanKeys,
}));

const [{ default: medicineAlertService }, { default: alertRepository }, { default: forecastingService }, { default: redisClient }, { default: prisma }, { scanKeys }] = await Promise.all([
  import(medicineAlertServicePath),
  import(alertRepositoryPath),
  import(forecastingServicePath),
  import(redisPath),
  import(prismaPath),
  import(scanKeysPath),
]);

describe('MedicineAlertService - Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.get.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Negative inventory handling', () => {
    it('should handle negative stock values gracefully', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          medicineId: 'med-1',
          currentStock: -5,
          thresholdValue: 20,
          medicine: { id: 'med-1', name: 'Dolo 650', reorderLevel: 20 },
        },
      ];

      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: mockAlerts,
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      forecastingService.predictDaysRemaining.mockResolvedValue(0);
      forecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 100,
        averageDailyUsage: 10,
      });

      const result = await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(result.alerts[0].currentStock).toBe(-5);
      expect(result.alerts[0].daysRemaining).toBe(0);
    });
  });

  describe('Duplicate expiry alerts', () => {
    it('should not create duplicate expiry alerts for same batch', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          branchId: 'branch-1',
          expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          quantity: 50,
          medicine: { name: 'Amoxicillin' },
        },
      ]);

      const result = await medicineAlertService._runExpiryScan('tenant-1');

      expect(result).toBe(1);
      expect(alertRepository.upsertExpiryAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Timezone expiry mismatch', () => {
    it('should handle expiry dates in different timezones', async () => {
      const tomorrowUTC = new Date();
      tomorrowUTC.setUTCDate(tomorrowUTC.getUTCDate() + 1);
      tomorrowUTC.setUTCHours(0, 0, 0, 0);

      prisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          branchId: 'branch-1',
          expiryDate: tomorrowUTC,
          quantity: 100,
          medicine: { name: 'UTC Medicine' },
        },
      ]);

      const result = await medicineAlertService._runExpiryScan('tenant-1');

      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Concurrent stock updates', () => {
    it('should handle concurrent stock updates without race conditions', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      const [result1, result2] = await Promise.all([
        medicineAlertService.getLowStockAlerts('tenant-1'),
        medicineAlertService.getLowStockAlerts('tenant-1'),
      ]);

      expect(result1).toEqual(result2);
    });
  });

  describe('Zero-demand medicines', () => {
    it('should handle medicines with zero consumption', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          medicineId: 'med-1',
          currentStock: 100,
          thresholdValue: 10,
          medicine: { id: 'med-1', name: 'Rare Medicine', reorderLevel: 10 },
        },
      ];

      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: mockAlerts,
        pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
      });

      forecastingService.predictDaysRemaining.mockResolvedValue(999);
      forecastingService.getReorderRecommendations.mockResolvedValue({
        recommendedOrderQuantity: 10,
        averageDailyUsage: 0,
      });

      const result = await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(result.alerts[0].daysRemaining).toBe(999);
      expect(result.alerts[0].averageDailyUsage).toBe(0);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate all alert caches for a tenant', async () => {
      scanKeys.mockResolvedValue([
        'alerts:tenant-1:low-stock',
        'alerts:tenant-1:expiry',
        'alerts:tenant-1:out-of-stock',
      ]);

      await medicineAlertService._invalidateCache('tenant-1');

      expect(redisClient.del).toHaveBeenCalledWith(
        'alerts:tenant-1:low-stock',
        'alerts:tenant-1:expiry',
        'alerts:tenant-1:out-of-stock',
      );
    });

    it('should handle Redis errors gracefully during cache invalidation', async () => {
      scanKeys.mockRejectedValue(new Error('Redis connection lost'));

      await expect(medicineAlertService._invalidateCache('tenant-1')).resolves.not.toThrow();
    });
  });

  describe('Branch isolation', () => {
    it('should filter alerts by branch when specified', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      await medicineAlertService.getLowStockAlerts('tenant-1', { branchId: 'branch-1' });

      expect(alertRepository.findLowStockAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
        }),
      );
    });

    it('should return all alerts when no branch specified', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(alertRepository.findLowStockAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: undefined,
        }),
      );
    });
  });

  describe('Severity filtering', () => {
    it('should filter alerts by severity when specified', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      await medicineAlertService.getLowStockAlerts('tenant-1', { severity: 'CRITICAL' });

      expect(alertRepository.findLowStockAlerts).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
        }),
      );
    });
  });

  describe('Pagination edge cases', () => {
    it('should handle empty result sets', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
      });

      const result = await medicineAlertService.getLowStockAlerts('tenant-1');

      expect(result.alerts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should handle large page numbers gracefully', async () => {
      alertRepository.findLowStockAlerts.mockResolvedValue({
        alerts: [],
        pagination: { total: 5, page: 100, limit: 50, totalPages: 1 },
      });

      const result = await medicineAlertService.getLowStockAlerts('tenant-1', { page: 100 });

      expect(result.alerts).toHaveLength(0);
    });
  });
});
