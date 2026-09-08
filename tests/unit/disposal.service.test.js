import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  inventoryDisposal: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
  },
  inventory: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(async (arg) => {
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    return Promise.all(arg);
  }),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedis,
}));

jest.unstable_mockModule('../../src/shared/utils/scan-keys.js', () => ({
  scanKeys: jest.fn().mockResolvedValue([]),
}));

jest.unstable_mockModule(
  '../../src/modules/inventory/service/unified-inventory-summary.service.js',
  () => ({
    default: {
      invalidateCache: jest.fn().mockResolvedValue(),
      getExpiryMetrics: jest.fn().mockResolvedValue({}),
    },
  }),
);

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: {
    log: jest.fn().mockResolvedValue(),
  },
}));

jest.unstable_mockModule('../../src/queue/index.js', () => ({
  mainQueue: {
    add: jest.fn().mockResolvedValue(),
  },
}));

const { default: disposeService } =
  await import('../../src/modules/inventory/service/dispose.service.js');

const { default: bulkDisposalService } =
  await import('../../src/modules/disposal/disposal.service.js');

describe('Disposal Services - Expiry Validation Tests', () => {
  const tenantId = 'tenant-test-1';
  const userId = 'user-test-1';
  const branchId = 'branch-test-1';

  // Format today's date YYYY-MM-DD
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Tomorrow's date
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Yesterday's date
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('disposeService.disposeBatches', () => {
    it('successfully disposes batch expiring TODAY with status ACTIVE (BD26032538 regression)', async () => {
      const batchBD = {
        id: 'batch-bd',
        batchNumber: 'BD26032538',
        availableQuantity: 13,
        quantity: 13,
        expiryDate: todayStr,
        status: 'ACTIVE',
        purchasePrice: 10,
        mrp: 15,
        branchId,
        medicineId: 'med-1',
        medicine: { id: 'med-1', name: 'Paracetamol' },
      };

      mockPrisma.inventoryBatch.findMany.mockResolvedValue([batchBD]);

      const result = await disposeService.disposeBatches(
        tenantId,
        userId,
        ['batch-bd'],
        'Expired Stock',
        'Disposing expired batch',
      );

      expect(result.success).toBe(true);
      expect(result.disposedBatches).toBe(1);
      expect(result.disposedUnits).toBe(13);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('successfully disposes batch with status EXPIRED and past expiry date', async () => {
      const pastBatch = {
        id: 'batch-past',
        batchNumber: 'P001',
        availableQuantity: 20,
        quantity: 20,
        expiryDate: yesterdayStr,
        status: 'EXPIRED',
        purchasePrice: 5,
        mrp: 8,
        branchId,
        medicineId: 'med-2',
        medicine: { id: 'med-2', name: 'Amoxicillin' },
      };

      mockPrisma.inventoryBatch.findMany.mockResolvedValue([pastBatch]);

      const result = await disposeService.disposeBatches(
        tenantId,
        userId,
        ['batch-past'],
        'Expired Stock',
      );

      expect(result.success).toBe(true);
      expect(result.disposedBatches).toBe(1);
      expect(result.disposedUnits).toBe(20);
    });

    it('rejects disposal of future batch with status ACTIVE', async () => {
      const futureBatch = {
        id: 'batch-future',
        batchNumber: 'F001',
        availableQuantity: 50,
        quantity: 50,
        expiryDate: tomorrowStr,
        status: 'ACTIVE',
        medicine: { id: 'med-3', name: 'Vitamin C' },
      };

      mockPrisma.inventoryBatch.findMany.mockResolvedValue([futureBatch]);

      await expect(
        disposeService.disposeBatches(tenantId, userId, ['batch-future'], 'Expired Stock'),
      ).rejects.toThrow(/only EXPIRED batches can be disposed/);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects batch with 0 available quantity', async () => {
      const emptyBatch = {
        id: 'batch-empty',
        batchNumber: 'E001',
        availableQuantity: 0,
        expiryDate: todayStr,
        status: 'EXPIRED',
        medicine: { id: 'med-4', name: 'Aspirin' },
      };

      mockPrisma.inventoryBatch.findMany.mockResolvedValue([emptyBatch]);

      await expect(
        disposeService.disposeBatches(tenantId, userId, ['batch-empty'], 'Expired Stock'),
      ).rejects.toThrow(/no available quantity/);
    });
  });

  describe('bulkDisposalService.bulkDispose', () => {
    it('allows disposal of items expiring today even if status is ACTIVE', async () => {
      const batchToday = {
        id: 'batch-today',
        tenantId,
        batchNumber: 'BD26032538',
        availableQuantity: 10,
        quantity: 10,
        expiryDate: todayStr,
        status: 'ACTIVE',
        purchasePrice: 10,
        mrp: 15,
        branchId,
        medicineId: 'med-1',
      };

      mockPrisma.inventoryBatch.findFirst.mockResolvedValue(batchToday);

      const results = await bulkDisposalService.bulkDispose(tenantId, userId, branchId, {
        items: [{ medicineId: 'med-1', batchId: 'batch-today', quantity: 10 }],
        reason: 'Expired Stock',
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('DISPOSED');
      expect(results[0].batchId).toBe('batch-today');
    });

    it('skips future items with ACTIVE status', async () => {
      const batchFuture = {
        id: 'batch-fut',
        tenantId,
        batchNumber: 'F002',
        availableQuantity: 10,
        quantity: 10,
        expiryDate: tomorrowStr,
        status: 'ACTIVE',
        medicineId: 'med-2',
      };

      mockPrisma.inventoryBatch.findFirst.mockResolvedValue(batchFuture);

      const results = await bulkDisposalService.bulkDispose(tenantId, userId, branchId, {
        items: [{ medicineId: 'med-2', batchId: 'batch-fut', quantity: 5 }],
        reason: 'Expired Stock',
      });

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SKIPPED');
      expect(results[0].reason).toContain('Only expired batches can be disposed');
    });
  });
});
