import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const auditServicePath = path.resolve(__dirname, '../../audit/service/audit.prisma.service.js');
const cacheInvalidatorPath = path.resolve(__dirname, '../service/cache-invalidator.service.js');
const lockPath = path.resolve(__dirname, '../../../shared/utils/lock.js');
const queuePath = path.resolve(__dirname, '../../../queue/index.js');
const inventoryClearServicePath = path.resolve(__dirname, '../service/inventory-clear.service.js');

const mockPrisma = {
  inventoryBatch: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
    updateMany: jest.fn(),
  },
  branch: {
    findFirst: jest.fn(),
  },
  importJob: {
    findFirst: jest.fn(),
  },
  batchAuditLog: {
    createMany: jest.fn(),
  },
  stockMovement: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

const mockCacheInvalidator = {
  invalidateInventoryCaches: jest.fn().mockResolvedValue(undefined),
};

const mockLock = {
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = {
  mainQueue: {
    add: jest.fn().mockResolvedValue(undefined),
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

jest.unstable_mockModule(auditServicePath, () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule(cacheInvalidatorPath, () => ({
  default: mockCacheInvalidator,
}));

jest.unstable_mockModule(lockPath, () => mockLock);

jest.unstable_mockModule(queuePath, () => mockQueue);

const { default: inventoryClearService } = await import(inventoryClearServicePath);

describe('InventoryClearService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLock.acquireLock.mockResolvedValue(true);
    mockPrisma.importJob.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getClearSummary', () => {
    it('returns aggregated batch count, total units, and branch name', async () => {
      mockPrisma.inventoryBatch.aggregate.mockResolvedValue({
        _count: { id: 12 },
        _sum: { availableQuantity: 3450, quantity: 3450 },
      });
      mockPrisma.branch.findFirst.mockResolvedValue({
        name: 'Main Pharmacy Branch',
      });

      const summary = await inventoryClearService.getClearSummary('tenant-1', 'branch-1');

      expect(summary.batchCount).toBe(12);
      expect(summary.totalUnits).toBe(3450);
      expect(summary.branchName).toBe('Main Pharmacy Branch');
      expect(mockPrisma.inventoryBatch.aggregate).toHaveBeenCalled();
    });

    it('handles empty inventory gracefully', async () => {
      mockPrisma.inventoryBatch.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { availableQuantity: null, quantity: null },
      });
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      const summary = await inventoryClearService.getClearSummary('tenant-1', 'branch-1');

      expect(summary.batchCount).toBe(0);
      expect(summary.totalUnits).toBe(0);
      expect(summary.branchName).toBeNull();
    });
  });

  describe('clearBranchInventory', () => {
    it('throws 409 conflict when distributed lock cannot be acquired', async () => {
      mockLock.acquireLock.mockResolvedValue(false);

      await expect(
        inventoryClearService.clearBranchInventory('tenant-1', 'branch-1', 'user-1'),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'OPERATION_IN_PROGRESS',
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws 409 conflict when an import is currently in progress', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: 'job-123',
        importStatus: 'PROCESSING',
      });

      await expect(
        inventoryClearService.clearBranchInventory('tenant-1', 'branch-1', 'user-1'),
      ).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'IMPORT_IN_PROGRESS',
      });

      expect(mockPrisma.inventoryBatch.findMany).not.toHaveBeenCalled();
      expect(mockLock.releaseLock).toHaveBeenCalled();
    });

    it('returns safe response when no active inventory exists', async () => {
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

      const result = await inventoryClearService.clearBranchInventory(
        'tenant-1',
        'branch-1',
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.summary.batchesCleared).toBe(0);
      expect(result.summary.unitsCleared).toBe(0);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockLock.releaseLock).toHaveBeenCalled();
    });

    it('atomically clears active batches, records audit and movements, and invalidates cache', async () => {
      const mockBatches = [
        {
          id: 'batch-1',
          medicineId: 'med-1',
          batchNumber: 'B101',
          quantity: 100,
          availableQuantity: 100,
          reservedQuantity: 0,
          status: 'ACTIVE',
        },
        {
          id: 'batch-2',
          medicineId: 'med-2',
          batchNumber: 'B102',
          quantity: 50,
          availableQuantity: 50,
          reservedQuantity: 0,
          status: 'LOW_STOCK',
        },
      ];

      mockPrisma.inventoryBatch.findMany.mockResolvedValue(mockBatches);

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          inventoryBatch: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
          batchAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
          stockMovement: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
        };
        return callback(tx);
      });

      const result = await inventoryClearService.clearBranchInventory(
        'tenant-1',
        'branch-1',
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.summary.batchesCleared).toBe(2);
      expect(result.summary.unitsCleared).toBe(150);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLEAR_INVENTORY',
          tenantId: 'tenant-1',
          userId: 'user-1',
        }),
      );
      expect(mockCacheInvalidator.invalidateInventoryCaches).toHaveBeenCalledWith('tenant-1', [
        'med-1',
        'med-2',
      ]);
      expect(mockLock.releaseLock).toHaveBeenCalled();
    });

    it('rolls back and releases lock if transaction throws an error', async () => {
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          batchNumber: 'B101',
          quantity: 10,
          availableQuantity: 10,
          reservedQuantity: 0,
          status: 'ACTIVE',
        },
      ]);

      mockPrisma.$transaction.mockRejectedValue(new Error('Database transaction timeout'));

      await expect(
        inventoryClearService.clearBranchInventory('tenant-1', 'branch-1', 'user-1'),
      ).rejects.toThrow('Database transaction timeout');

      expect(mockLock.releaseLock).toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });
  });
});
