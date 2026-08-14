import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockAuditService = {
  logAction: jest.fn().mockResolvedValue(),
};

const mockPrisma = {
  medicine: {
    createMany: jest.fn(),
    update: jest.fn(),
  },
  inventoryBatch: {
    createMany: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  stockMovement: {
    createMany: jest.fn(),
  },
  inventory: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (callback) => await callback(mockPrisma)),
};

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const { default: sharedImportEngine } =
  await import('../../src/modules/import/services/shared-import.engine.js');

describe('SharedImportEngine - Integrity & Ordering Enforcement', () => {
  const tenantId = 'tenant-test-1';
  const branchId = 'branch-test-1';
  const userId = 'user-test-1';

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma.medicine.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.medicine.update.mockResolvedValue({});
    mockPrisma.inventoryBatch.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventoryBatch.update.mockResolvedValue({});
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
    mockPrisma.stockMovement.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventory.findMany.mockResolvedValue([]);
    mockPrisma.inventory.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventory.update.mockResolvedValue({});
    mockPrisma.$transaction.mockImplementation(async (callback) => await callback(mockPrisma));
  });

  it('should successfully commit chunk with strictly ordered execution', async () => {
    const medicineId = 'med-1';
    const batchId = 'batch-1';
    const executionOrder = [];

    mockPrisma.medicine.createMany.mockImplementation(async () => {
      executionOrder.push('medicine.createMany');
      return { count: 1 };
    });
    mockPrisma.medicine.update.mockImplementation(async () => {
      executionOrder.push('medicine.update');
      return {};
    });
    mockPrisma.inventoryBatch.createMany.mockImplementation(async () => {
      executionOrder.push('inventoryBatch.createMany');
      return { count: 1 };
    });
    mockPrisma.inventoryBatch.update.mockImplementation(async () => {
      executionOrder.push('inventoryBatch.update');
      return {};
    });
    mockPrisma.inventoryBatch.findMany.mockImplementation(async () => {
      executionOrder.push('inventoryBatch.findMany');
      return [{ id: batchId, medicineId }];
    });
    mockPrisma.stockMovement.createMany.mockImplementation(async () => {
      executionOrder.push('stockMovement.createMany');
      return { count: 1 };
    });
    mockPrisma.inventory.findMany.mockImplementation(async () => {
      executionOrder.push('inventory.findMany');
      return [{ medicineId }];
    });
    mockPrisma.inventory.update.mockImplementation(async () => {
      executionOrder.push('inventory.update');
      return {};
    });

    await sharedImportEngine.commitChunks({
      tenantId,
      branchId,
      userId,
      jobId: 'job-order-test',
      newMedicines: [{ id: medicineId, tenantId, name: 'Paracetamol' }],
      medicineUpdates: [{ id: medicineId, data: { status: 'ACTIVE' } }],
      newBatches: [{ id: batchId, medicineId, tenantId, branchId, batchNumber: 'B1' }],
      batchQuantityUpdates: [{ batchId, qty: 10, medicineId }],
      newMovements: [{ id: 'mov-1', batchId, medicineId, tenantId, branchId, quantity: 10 }],
      inventoryUpdates: [{ medicineId, qty: 20 }],
    });

    expect(executionOrder).toEqual([
      'medicine.createMany',
      'medicine.update',
      'inventoryBatch.createMany',
      'inventoryBatch.update',
      'inventoryBatch.findMany',
      'stockMovement.createMany',
      'inventory.findMany',
      'inventory.update',
    ]);
  });

  it('should reject duplicate InventoryBatch IDs in the chunk', async () => {
    const medicineId = 'med-dup';
    const duplicateBatchId = 'batch-dup-id';

    await expect(
      sharedImportEngine.commitChunks({
        tenantId,
        branchId,
        userId,
        jobId: 'job-dup-batch-id',
        newMedicines: [{ id: medicineId, tenantId, name: 'Aspirin' }],
        newBatches: [
          { id: duplicateBatchId, medicineId, tenantId, branchId, batchNumber: 'B101' },
          { id: duplicateBatchId, medicineId, tenantId, branchId, batchNumber: 'B102' },
        ],
        newMovements: [],
        inventoryUpdates: [],
      }),
    ).rejects.toThrow(/Duplicate InventoryBatch IDs detected/);
  });

  it('should abort transaction when StockMovement references non-existent batchId', async () => {
    const medicineId = 'med-missing-batch';
    const nonExistentBatchId = 'batch-does-not-exist';

    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]); // Batch not found in DB

    await expect(
      sharedImportEngine.commitChunks({
        tenantId,
        branchId,
        userId,
        jobId: 'job-orphan-mov',
        newMedicines: [{ id: medicineId, tenantId, name: 'Ibuprofen' }],
        newBatches: [],
        newMovements: [
          {
            id: 'mov-orphan',
            batchId: nonExistentBatchId,
            medicineId,
            tenantId,
            branchId,
            quantity: 5,
          },
        ],
        inventoryUpdates: [],
      }),
    ).rejects.toThrow(
      /Import integrity failure: 1 stock movement\(s\) reference missing inventory batches/,
    );

    expect(mockPrisma.stockMovement.createMany).not.toHaveBeenCalled();
  });

  it('should not retry permanent foreign key errors (P2003)', async () => {
    const medicineId = 'med-fk-error';
    const batchId = 'batch-fk-1';

    const fkError = new Error('Foreign key constraint failed');
    fkError.code = 'P2003';

    mockPrisma.medicine.createMany.mockRejectedValue(fkError);

    await expect(
      sharedImportEngine.commitChunks({
        tenantId,
        branchId,
        userId,
        jobId: 'job-p2003-test',
        newMedicines: [{ id: medicineId, tenantId, name: 'Amoxicillin' }],
        newBatches: [{ id: batchId, medicineId, tenantId, branchId, batchNumber: 'B99' }],
        newMovements: [],
        inventoryUpdates: [],
      }),
    ).rejects.toThrow('Foreign key constraint failed');

    // Called only once because P2003 is non-retryable
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('should retry transient errors up to retries count', async () => {
    const medicineId = 'med-transient';
    const batchId = 'batch-transient-1';

    const transientError = new Error('Database connection lost');

    mockPrisma.medicine.createMany
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce({ count: 1 });
    mockPrisma.inventoryBatch.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([{ id: batchId, medicineId }]);
    mockPrisma.stockMovement.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.inventory.findMany.mockResolvedValue([{ medicineId }]);
    mockPrisma.inventory.update.mockResolvedValue({});

    await sharedImportEngine.commitChunks({
      tenantId,
      branchId,
      userId,
      jobId: 'job-transient-test',
      newMedicines: [{ id: medicineId, tenantId, name: 'Cetirizine' }],
      newBatches: [{ id: batchId, medicineId, tenantId, branchId, batchNumber: 'B55' }],
      newMovements: [{ id: 'mov-1', batchId, medicineId, tenantId, branchId, quantity: 10 }],
      inventoryUpdates: [{ medicineId, qty: 10 }],
    });

    // Succeeded on 2nd attempt
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
