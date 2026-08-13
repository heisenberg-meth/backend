import { jest, describe, afterEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const redisPath = path.resolve(__dirname, '../../src/config/redis.js');
const prismaPath = path.resolve(__dirname, '../../src/config/prisma.js');
const configurationRepositoryPath = path.resolve(
  __dirname,
  '../../src/modules/medicine-configuration/repositories/configuration.repository.js',
);
const forecastingServicePath = path.resolve(
  __dirname,
  '../../src/modules/medicine-alerts/forecasting/forecasting.service.js',
);
const erpEventBusPath = path.resolve(__dirname, '../../src/shared/events/erp-event-bus.js');
const configurationServicePath = path.resolve(
  __dirname,
  '../../src/modules/medicine-configuration/services/configuration.service.js',
);

const mockPrisma = {
  medicine: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  medicinePricing: {
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  medicinePriceHistory: {
    create: jest.fn(),
  },
  medicineStatusHistory: {
    create: jest.fn(),
  },
  medicineInventoryConfig: {
    findFirst: jest.fn(),
  },
};

const mockConfigRepo = {
  updateInventoryConfig: jest.fn(),
  updatePricing: jest.fn(),
  updateStatus: jest.fn(),
};

const mockForecasting = {
  getReorderRecommendations: jest.fn(),
};

const mockEmit = jest.fn();

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn().mockResolvedValue(['0', []]),
  keys: jest.fn().mockResolvedValue([]),
};

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedisClient,
  quitRedis: jest.fn().mockResolvedValue(),
  getBullRedis: jest.fn(() => mockRedisClient),
  initRedis: jest.fn(() => mockRedisClient),
}));

jest.unstable_mockModule(prismaPath, () => ({ default: mockPrisma }));
jest.unstable_mockModule(configurationRepositoryPath, () => ({ default: mockConfigRepo }));
jest.unstable_mockModule(forecastingServicePath, () => ({ default: mockForecasting }));
jest.unstable_mockModule(erpEventBusPath, () => ({ emitEvent: mockEmit }));

const { default: configService } = await import(configurationServicePath);

describe('ConfigurationService — Pharmaceutical Governance', () => {
  const tenantId = 'tenant-1';
  const medicineId = 'med-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateReorderPoint', () => {
    it('should reject negative reorder point', async () => {
      await expect(
        configService.updateReorderPoint(medicineId, tenantId, {
          reorderPoint: -5,
          safetyStock: 10,
          updatedBy: userId,
        }),
      ).rejects.toThrow('Reorder point and safety stock cannot be negative');
    });

    it('should reject reorder point exceeding max stock limit', async () => {
      await expect(
        configService.updateReorderPoint(medicineId, tenantId, {
          reorderPoint: 100,
          safetyStock: 10,
          maxStockLimit: 50,
          updatedBy: userId,
        }),
      ).rejects.toThrow('Reorder point must be below max stock limit');
    });

    it('should update and emit event on valid input', async () => {
      mockConfigRepo.updateInventoryConfig.mockResolvedValue({
        id: 'config-1',
        reorderPoint: 50,
        safetyStock: 20,
      });

      const result = await configService.updateReorderPoint(medicineId, tenantId, {
        reorderPoint: 50,
        safetyStock: 20,
        maxStockLimit: 500,
        updatedBy: userId,
      });

      expect(mockConfigRepo.updateInventoryConfig).toHaveBeenCalledWith(
        medicineId,
        tenantId,
        expect.objectContaining({
          reorderPoint: 50,
          safetyStock: 20,
          maxStockLimit: 500,
          updatedBy: userId,
        }),
      );
      expect(mockEmit).toHaveBeenCalledWith(
        'MEDICINE_REORDER_UPDATED',
        expect.objectContaining({ medicineId, reorderPoint: 50 }),
      );
      expect(result.reorderPoint).toBe(50);
    });
  });

  describe('updatePricing', () => {
    it('should reject selling price above MRP', async () => {
      await expect(
        configService.updatePricing(medicineId, tenantId, {
          mrp: 100,
          sellingPrice: 120,
          purchasePrice: 80,
          changedBy: userId,
        }),
      ).rejects.toThrow('Selling price cannot exceed MRP');
    });

    it('should reject negative margin (selling below cost)', async () => {
      await expect(
        configService.updatePricing(medicineId, tenantId, {
          mrp: 100,
          sellingPrice: 50,
          purchasePrice: 80,
          changedBy: userId,
        }),
      ).rejects.toThrow(/Negative margin/);
    });

    it('should flag price changes >20% as needing approval', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({ sellingPrice: 100 });
      mockConfigRepo.updatePricing.mockResolvedValue({ id: 'history-1' });

      const result = await configService.updatePricing(medicineId, tenantId, {
        mrp: 150,
        sellingPrice: 130,
        purchasePrice: 90,
        changedBy: userId,
      });

      expect(result.meta.priceChangePercent).toBe(30);
      expect(result.meta.needsApproval).toBe(true);
    });

    it('should not flag small price changes', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({ sellingPrice: 100 });
      mockConfigRepo.updatePricing.mockResolvedValue({ id: 'history-2' });

      const result = await configService.updatePricing(medicineId, tenantId, {
        mrp: 110,
        sellingPrice: 105,
        purchasePrice: 85,
        changedBy: userId,
      });

      expect(result.meta.needsApproval).toBe(false);
    });

    it('should calculate margin correctly', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({ sellingPrice: 100 });
      mockConfigRepo.updatePricing.mockResolvedValue({ id: 'history-3' });

      const result = await configService.updatePricing(medicineId, tenantId, {
        mrp: 120,
        sellingPrice: 100,
        purchasePrice: 70,
        changedBy: userId,
      });

      expect(result.meta.marginPercent).toBe(30);
    });
  });

  describe('updateStatus', () => {
    it('should warn on deactivation with active stock', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        scheduleType: null,
        prescriptionRequired: false,
        inventoryBatches: [{ quantity: 50 }, { quantity: 30 }],
      });
      mockConfigRepo.updateStatus.mockResolvedValue({ id: 'status-1' });

      const result = await configService.updateStatus(medicineId, tenantId, {
        status: 'INACTIVE',
        reason: 'DISCONTINUED',
        changedBy: userId,
      });

      expect(result).toBeDefined();
      expect(mockEmit).toHaveBeenCalledWith(
        'MEDICINE_STATUS_CHANGED',
        expect.objectContaining({ activeStock: 80, newStatus: 'INACTIVE' }),
      );
    });

    it('should handle Schedule X drug restriction', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        scheduleType: 'X',
        prescriptionRequired: true,
        inventoryBatches: [],
      });
      mockConfigRepo.updateStatus.mockResolvedValue({ id: 'status-2' });

      await configService.updateStatus(medicineId, tenantId, {
        status: 'BLOCKED',
        reason: 'Schedule X controlled substance',
        changedBy: userId,
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'MEDICINE_STATUS_CHANGED',
        expect.objectContaining({ scheduleType: 'X', newStatus: 'BLOCKED' }),
      );
    });
  });

  describe('getReorderAnalytics', () => {
    it('should compute reorder point from ADU and lead time', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({ name: 'TestMed', reorderLevel: 10 });
      mockPrisma.medicineInventoryConfig.findFirst.mockResolvedValue(null);
      mockForecasting.getReorderRecommendations.mockResolvedValue({
        averageDailyUsage: 5,
        leadTime: 7,
        safetyStock: 18,
        recommendedOrderQuantity: 53,
        currentReorderLevel: 10,
      });

      const result = await configService.getReorderAnalytics(medicineId, tenantId, null);

      expect(result.averageDailyUsage).toBe(5);
      expect(result.leadTimeDays).toBe(7);
      expect(result.computedReorderPoint).toBe(53);
      expect(result.currentReorderPoint).toBe(10);
    });

    it('should return null computed reorder when no usage data', async () => {
      mockPrisma.medicine.findUnique.mockResolvedValue({ name: 'NewMed', reorderLevel: 10 });
      mockPrisma.medicineInventoryConfig.findFirst.mockResolvedValue(null);
      mockForecasting.getReorderRecommendations.mockResolvedValue({
        averageDailyUsage: 0,
        leadTime: 7,
        safetyStock: 0,
        recommendedOrderQuantity: 10,
        currentReorderLevel: 10,
      });

      const result = await configService.getReorderAnalytics(medicineId, tenantId, null);

      expect(result.computedReorderPoint).toBeNull();
    });
  });
});
