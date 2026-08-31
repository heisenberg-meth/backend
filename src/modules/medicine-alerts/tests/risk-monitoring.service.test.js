import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const alertRepositoryPath = path.resolve(__dirname, '../repositories/alert.repository.js');
const forecastingServicePath = path.resolve(__dirname, '../forecasting/forecasting.service.js');
const eventbusServicePath = path.resolve(__dirname, '../../../shared/services/eventbus.service.js');
const alertSettingsPath = path.resolve(
  __dirname,
  '../../alert-settings/services/alert-settings.service.js',
);
const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const riskMonitoringServicePath = path.resolve(__dirname, '../services/risk-monitoring.service.js');

const mockPrisma = {
  inventoryBatch: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  medicine: {
    findUnique: jest.fn(),
  },
  saleItem: {
    findFirst: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
  alertSettings: {
    findUnique: jest.fn(),
  },
  alertThresholdOverride: {
    findUnique: jest.fn(),
  },
};

const mockAlertRepository = {
  upsertStockAlert: jest.fn(),
  upsertExpiryAlert: jest.fn(),
  resolveStockAlerts: jest.fn(),
};

const mockForecastingService = {
  predictDaysRemaining: jest.fn(),
};

const mockEventBus = {
  publish: jest.fn(),
};

const mockAlertSettingsService = {
  getEffectiveThresholds: jest.fn().mockResolvedValue({
    lowStock: 20,
    criticalStock: 5,
    expiryWarning: 30,
    criticalExpiry: 7,
    autoRaisePO: false,
    escalationHours: 24,
  }),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(alertRepositoryPath, () => ({
  default: mockAlertRepository,
}));

jest.unstable_mockModule(forecastingServicePath, () => ({
  default: mockForecastingService,
}));

jest.unstable_mockModule(eventbusServicePath, () => ({
  default: mockEventBus,
}));

jest.unstable_mockModule(alertSettingsPath, () => ({
  default: mockAlertSettingsService,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedis,
}));

// Import modules AFTER mocking
const [{ default: riskMonitoringService }, { default: alertRepository }, { default: forecastingService }, { default: prisma }, { default: eventBus }] = await Promise.all([
  import(riskMonitoringServicePath),
  import(alertRepositoryPath),
  import(forecastingServicePath),
  import(prismaPath),
  import(eventbusServicePath),
]);

describe('RiskMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAlertSettingsService.getEffectiveThresholds.mockResolvedValue({
      lowStock: 20,
      criticalStock: 5,
      expiryWarning: 30,
      criticalExpiry: 7,
      autoRaisePO: false,
      escalationHours: 24,
    });
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
    mockPrisma.saleItem.findFirst.mockResolvedValue(null);
  });

  describe('handleStockMovement', () => {
    it('should create CRITICAL alert when stock is zero', async () => {
      prisma.inventoryBatch.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      prisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Insulin',
        reorderLevel: 20,
        prescriptionRequired: true,
      });
      forecastingService.predictDaysRemaining.mockResolvedValue(0);

      await riskMonitoringService.handleStockMovement({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        medicineId: 'med-1',
      });

      expect(alertRepository.upsertStockAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'OUT_OF_STOCK',
          severity: 'CRITICAL',
        }),
      );
    });

    it('should create WARNING alert when stock is below threshold', async () => {
      prisma.inventoryBatch.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });
      prisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        reorderLevel: 20,
        prescriptionRequired: false,
      });
      forecastingService.predictDaysRemaining.mockResolvedValue(2);

      await riskMonitoringService.handleStockMovement({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        medicineId: 'med-1',
      });

      expect(alertRepository.upsertStockAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOW_STOCK',
          severity: 'WARNING',
        }),
      );
    });

    it('should resolve alerts when stock is above threshold', async () => {
      prisma.inventoryBatch.aggregate.mockResolvedValue({ _sum: { quantity: 50 } });
      prisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        reorderLevel: 20,
        prescriptionRequired: false,
      });

      await riskMonitoringService.handleStockMovement({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        medicineId: 'med-1',
      });

      expect(alertRepository.resolveStockAlerts).toHaveBeenCalledWith(
        'med-1',
        'tenant-1',
        'branch-1',
      );
    });

    it('should recommend transfer when warehouse has stock', async () => {
      prisma.inventoryBatch.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 3 } })
        .mockResolvedValueOnce({ _sum: { quantity: 100 } });
      prisma.medicine.findUnique.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        reorderLevel: 20,
        prescriptionRequired: false,
      });
      forecastingService.predictDaysRemaining.mockResolvedValue(1);

      await riskMonitoringService.handleStockMovement({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        medicineId: 'med-1',
      });

      expect(alertRepository.upsertStockAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Stock transfer recommended'),
        }),
      );
    });
  });

  describe('runExpiryScan', () => {
    it('should detect and classify expiring batches', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          branchId: 'branch-1',
          expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          quantity: 50,
          medicine: { name: 'Amoxicillin' },
        },
        {
          id: 'batch-2',
          medicineId: 'med-2',
          branchId: 'branch-1',
          expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
          quantity: 30,
          medicine: { name: 'Paracetamol' },
        },
      ]);

      const result = await riskMonitoringService.runExpiryScan('tenant-1');

      expect(result).toBe(2);
      // Only batch-1 (10 days) triggers alert since 10 <= expiryWarning(30)
      // batch-2 (45 days) doesn't trigger since 45 > expiryWarning(30)
      expect(alertRepository.upsertExpiryAlert).toHaveBeenCalledTimes(1);
    });

    it('should handle already expired batches', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          branchId: 'branch-1',
          expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          quantity: 20,
          medicine: { name: 'Expired Med' },
        },
      ]);

      await riskMonitoringService.runExpiryScan('tenant-1');

      expect(alertRepository.upsertExpiryAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
        }),
      );
    });
  });

  describe('verifyFEFOCompliance', () => {
    it('should detect FEFO violation when newer batch sold before older', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        { id: 'batch-old', batchNumber: 'OLD001', expiryDate: new Date('2026-06-01') },
        { id: 'batch-new', batchNumber: 'NEW001', expiryDate: new Date('2027-01-01') },
      ]);
      prisma.saleItem.findFirst.mockResolvedValue({
        batchId: 'batch-new',
        batch: { batchNumber: 'NEW001', expiryDate: new Date('2027-01-01') },
      });

      await riskMonitoringService.verifyFEFOCompliance('med-1', 'tenant-1', 'branch-1');

      expect(eventBus.publish).toHaveBeenCalledWith('FEFO_VIOLATION_DETECTED', expect.any(Object));
    });

    it('should not flag violation when oldest batch is sold', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        { id: 'batch-old', batchNumber: 'OLD001', expiryDate: new Date('2026-06-01') },
        { id: 'batch-new', batchNumber: 'NEW001', expiryDate: new Date('2027-01-01') },
      ]);
      prisma.saleItem.findFirst.mockResolvedValue({
        batchId: 'batch-old',
        batch: { batchNumber: 'OLD001', expiryDate: new Date('2026-06-01') },
      });

      await riskMonitoringService.verifyFEFOCompliance('med-1', 'tenant-1', 'branch-1');

      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should skip check when only one batch exists', async () => {
      prisma.inventoryBatch.findMany.mockResolvedValue([
        { id: 'batch-only', batchNumber: 'ONLY001', expiryDate: new Date('2026-06-01') },
      ]);

      await riskMonitoringService.verifyFEFOCompliance('med-1', 'tenant-1', 'branch-1');

      expect(prisma.saleItem.findFirst).not.toHaveBeenCalled();
    });
  });
});
