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
            expiryDate: { gt: expect.any(Date) },
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

    it('returns medicine when it has active usable stock in the target branch', async () => {
      const medicine = {
        id: 'medicine-1',
        name: 'Acyclovir 400mg',
        inventory: [
          {
            branchId: 'branch-456',
            currentStock: 25,
          },
        ],
        inventoryBatches: [
          {
            id: 'batch-1',
            batchNumber: 'ACV-001',
            quantity: 25,
            availableQuantity: 25,
            reservedQuantity: 0,
            status: 'ACTIVE',
            isArchived: false,
            expiryDate: new Date(Date.now() + 86400000 * 100),
          },
        ],
      };

      mockPrisma.medicine.findMany.mockResolvedValue([medicine]);
      mockPrisma.medicine.count.mockResolvedValue(1);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      expect(result.total).toBe(1);
      expect(result.medicines).toHaveLength(1);
      expect(result.medicines[0].name).toBe('Acyclovir 400mg');
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

      const queries = mockPrisma.$queryRaw.mock.calls;
      expect(queries.length).toBe(2);

      // Verify both SQL queries contain branch, active_batch_count, isArchived, and deletedAt checks
      for (const call of queries) {
        const sql = call[0]?.strings?.join?.(' ') || String(call[0]);
        expect(sql).toContain('branchId');
        expect(sql).toContain('active_batch_count');
        expect(sql).toContain('isArchived');
        expect(sql).toContain('deletedAt');
      }
    });

    it('excludes cleared inventory from all inventory listing results', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        skip: 0,
        take: 20,
      });

      expect(result).toEqual({
        medicines: [],
        total: 0,
      });

      const queryArg = mockPrisma.medicine.findMany.mock.calls[0][0];

      expect(queryArg.where.inventoryBatches.some).toEqual({
        branchId: 'branch-456',
        deletedAt: null,
        isArchived: false,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
        expiryDate: {
          gt: expect.any(Date),
        },
      });
    });

    it('excludes expired batches from active inventory listing', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      const result = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      expect(result.medicines).toEqual([]);
      expect(result.total).toBe(0);

      const queryArg = mockPrisma.medicine.findMany.mock.calls[0][0];

      expect(queryArg.where.inventoryBatches.some).toMatchObject({
        branchId: 'branch-456',
        deletedAt: null,
        isArchived: false,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
        expiryDate: {
          gt: expect.any(Date),
        },
      });
    });

    it('includes batchNumber in search filters to support searching by batch (TC-004)', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.medicine.count.mockResolvedValue(0);

      await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        search: 'BD26120437',
      });

      expect(mockPrisma.medicine.findMany).toHaveBeenCalledTimes(1);
      const queryArg = mockPrisma.medicine.findMany.mock.calls[0][0];
      const orClauses = queryArg.where.OR;

      expect(orClauses).toEqual(
        expect.arrayContaining([
          { name: { contains: 'BD26120437', mode: 'insensitive' } },
          { genericName: { contains: 'BD26120437', mode: 'insensitive' } },
          { barcode: { contains: 'BD26120437', mode: 'insensitive' } },
          { sku: { contains: 'BD26120437', mode: 'insensitive' } },
          {
            inventoryBatches: {
              some: {
                branchId: 'branch-456',
                deletedAt: null,
                isArchived: false,
                batchNumber: { contains: 'BD26120437', mode: 'insensitive' },
              },
            },
          },
        ]),
      );
    });

    it('calculates identical availableStock for medicine when unsearched vs searched (TC-001 vs TC-002)', async () => {
      const mockMedicine = {
        id: 'med-acy-1',
        name: 'Acyclovir 400mg',
        inventory: [{ branchId: 'branch-456', currentStock: 4 }],
        inventoryBatches: [
          {
            id: 'batch-1',
            batchNumber: 'BD26120437',
            quantity: 4,
            availableQuantity: 4,
            reservedQuantity: 0,
            status: 'ACTIVE',
            isArchived: false,
            branchId: 'branch-456',
            deletedAt: null,
            expiryDate: new Date(Date.now() + 86400000 * 365),
          },
        ],
      };

      // 1. Initial view without search
      mockPrisma.medicine.findMany.mockResolvedValueOnce([mockMedicine]);
      mockPrisma.medicine.count.mockResolvedValueOnce(1);

      const unsearchedResult = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
      });

      // 2. Searched view with "acy"
      mockPrisma.medicine.findMany.mockResolvedValueOnce([mockMedicine]);
      mockPrisma.medicine.count.mockResolvedValueOnce(1);

      const searchedResult = await medicineRepository.findAll({
        tenantId: 'tenant-123',
        branchId: 'branch-456',
        search: 'acy',
      });

      expect(unsearchedResult.medicines[0].availableStock).toBe(4);
      expect(searchedResult.medicines[0].availableStock).toBe(4);
      expect(searchedResult.medicines[0].batchNumber).toBe('BD26120437');
      expect(unsearchedResult.medicines[0].batchNumber).toBe(
        searchedResult.medicines[0].batchNumber,
      );
      expect(unsearchedResult.medicines[0].availableStock).toBe(
        searchedResult.medicines[0].availableStock,
      );
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
