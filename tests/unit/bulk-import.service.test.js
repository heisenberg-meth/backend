import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  category: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  manufacturer: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  medicine: { findMany: jest.fn().mockResolvedValue([]) },
  inventoryBatch: { findMany: jest.fn().mockResolvedValue([]) },
  supplier: {
    findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'Global Pharma' }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'Global Pharma' }),
  },
  importJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) },
};

const mockSharedEngine = {
  commitChunks: jest.fn().mockResolvedValue(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/modules/import/services/shared-import.engine.js', () => ({
  default: mockSharedEngine,
}));

const { default: bulkImportService } =
  await import('../../src/modules/import/services/bulk-import.service.js');

describe('BulkImportService - Duplicate Strategy & Batch Aggregation', () => {
  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should aggregate quantity into existing batch on Merge duplicate strategy', async () => {
    const existingMed = {
      id: 'med-existing-1',
      name: 'Amoxicillin 500mg',
      barcode: '1234567890123',
      categoryId: 'cat-1',
      manufacturerId: 'mfr-1',
    };

    const existingBatch = {
      id: 'batch-existing-1',
      medicineId: existingMed.id,
      batchNumber: 'BATCH-2026',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

    const importPayload = {
      medicines: [
        {
          name: 'Amoxicillin 500mg',
          barcode: '1234567890123',
          qty: '50',
          price: '25.50',
          batch: 'BATCH-2026',
        },
      ],
      duplicateStrategy: 'Merge',
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(mockSharedEngine.commitChunks).toHaveBeenCalledTimes(1);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];

    // No new medicines created
    expect(callArgs.newMedicines).toHaveLength(0);
    // No new batches created (it was aggregated to existing batch)
    expect(callArgs.newBatches).toHaveLength(0);
    // Batch quantity update scheduled for existing batch
    expect(callArgs.batchQuantityUpdates).toEqual([
      { batchId: 'batch-existing-1', qty: 50, medicineId: 'med-existing-1' },
    ]);
    // Movement created referencing existing batch ID
    expect(callArgs.newMovements).toHaveLength(1);
    expect(callArgs.newMovements[0].batchId).toBe('batch-existing-1');
    expect(callArgs.newMovements[0].quantity).toBe(50);
  });

  it('should skip duplicate rows when duplicateStrategy is Skip', async () => {
    const existingMed = {
      id: 'med-existing-2',
      name: 'Paracetamol 650mg',
      barcode: '9876543210987',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

    const importPayload = {
      medicines: [
        {
          name: 'Paracetamol 650mg',
          barcode: '9876543210987',
          qty: '100',
          price: '15.00',
          batch: 'BATCH-SKIP',
        },
      ],
      duplicateStrategy: 'Skip',
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.imported).toBe(0);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
    expect(callArgs.newMedicines).toHaveLength(0);
    expect(callArgs.newBatches).toHaveLength(0);
    expect(callArgs.newMovements).toHaveLength(0);
  });
});
