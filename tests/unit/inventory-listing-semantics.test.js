import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../src/config/prisma.js');
const redisPath = path.resolve(__dirname, '../../src/config/redis.js');
const loggerPath = path.resolve(__dirname, '../../src/shared/utils/logger.js');

const mockPrisma = {
  medicine: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedis,
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

describe('Inventory Listing Semantics & Summary Tests', () => {
  let medicineRepository;
  let unifiedInventorySummaryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const repoModule =
      await import('../../src/modules/inventory/repository/medicine.prisma.repository.js');
    medicineRepository = repoModule.default;

    const summaryModule =
      await import('../../src/modules/inventory/service/unified-inventory-summary.service.js');
    unifiedInventorySummaryService = summaryModule.default;
  });

  describe('MedicinePrismaRepository.findAll()', () => {
    it('passes active batch filter in baseWhere so cleared/batchless medicines are excluded', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      expect(result.medicines).toEqual([]);
      expect(result.total).toBe(0);

      expect(mockPrisma.medicine.findMany).toHaveBeenCalledTimes(1);
      const queryArg = mockPrisma.medicine.findMany.mock.calls[0][0];

      expect(queryArg.where).toMatchObject({
        tenantId: 'tenant-123',
        deletedAt: null,
        inventoryBatches: {
          some: {
            branchId: 'branch-456',
            deletedAt: null,
            isArchived: false,
            status: 'ACTIVE',
            availableQuantity: { gt: 0 },
          },
        },
      });
    });

    it('returns empty list when no active batches exist for the target branch', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      expect(result.medicines).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('does not return cleared medicines in OUT_OF_STOCK status', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 0 }]).mockResolvedValueOnce([]);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        status: 'OUT_OF_STOCK',
        skip: 0,
        take: 20,
      });

      expect(result.medicines).toEqual([]);
      expect(result.total).toBe(0);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('does not return archived batches as inventory after clear', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      const queryArg = mockPrisma.medicine.findMany.mock.calls[0][0];

      expect(queryArg.where.inventoryBatches.some).toMatchObject({
        branchId: 'branch-456',
        deletedAt: null,
        isArchived: false,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
      });
    });
  });

  describe('UnifiedInventorySummaryService.getUnifiedSummary()', () => {
    it('returns zero metrics when inventory is cleared / no active batches in branch', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            expiredBatches: 0,
            expiredProducts: 0,
            expiredUnits: 0,
            expiredValue: 0,
            expiring7Batches: 0,
            expiring7Products: 0,
            expiring30Batches: 0,
            expiring30Products: 0,
            expiring90Batches: 0,
            expiring90Products: 0,
            safeBatches: 0,
            safeProducts: 0,
            totalBatches: 0,
            totalProducts: 0,
            totalUnits: 0,
          },
        ])
        .mockResolvedValueOnce([
          {
            totalMedicines: 0,
            totalStock: 0,
            inventoryValue: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            expiredBatches: 0,
            inStockCount: 0,
            medicinesWithExpired: 0,
            totalProducts: 0,
          },
        ]);

      const summary = await unifiedInventorySummaryService.getUnifiedSummary(
        'tenant-123',
        'branch-456',
        true,
      );

      expect(summary).toMatchObject({
        totalMedicines: 0,
        totalProducts: 0,
        totalStock: 0,
        inventoryValue: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        inStockCount: 0,
        expiredBatches: 0,
      });
    });
  });
});
