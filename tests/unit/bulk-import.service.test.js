import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  category: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
  },
  medicineCategory: {
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
  importJob: {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    update: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findFirst: jest.fn(),
  },
};

const mockSharedEngine = {
  commitChunks: jest.fn().mockResolvedValue(),
};

const mockMainQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-bull-id' }),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/modules/import/services/shared-import.engine.js', () => ({
  default: mockSharedEngine,
}));

jest.unstable_mockModule('../../src/queue/index.js', () => ({
  mainQueue: mockMainQueue,
}));

const { default: bulkImportService } =
  await import('../../src/modules/import/services/bulk-import.service.js');

describe('BulkImportService - PRD Implementation & Test Cases', () => {
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
    // No new batches created (aggregated to existing batch)
    expect(callArgs.newBatches).toHaveLength(0);
    // Batch quantity update scheduled for existing batch with mode: 'INCREMENT'
    expect(callArgs.batchQuantityUpdates).toEqual([
      { batchId: 'batch-existing-1', qty: 50, medicineId: 'med-existing-1', mode: 'INCREMENT' },
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

    const existingBatch = {
      id: 'batch-existing-2',
      medicineId: existingMed.id,
      batchNumber: 'BATCH-SKIP',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

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

  it('should reject commit on Ask me strategy when duplicate decisions are unresolved (TC-IMP-04)', async () => {
    const existingMed = {
      id: 'med-existing-3',
      name: 'Azithromycin 500mg',
      barcode: '5555555555555',
    };

    const existingBatch = {
      id: 'batch-existing-3',
      medicineId: existingMed.id,
      batchNumber: 'BATCH-AZ-1',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

    const importPayload = {
      medicines: [
        {
          name: 'Azithromycin 500mg',
          barcode: '5555555555555',
          qty: '20',
          price: '85.00',
          batch: 'BATCH-AZ-1',
        },
      ],
      duplicateStrategy: 'Ask me',
      duplicateDecisions: {}, // No decision provided
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    await expect(
      bulkImportService.commit(importPayload, tenantId, branchId, userId),
    ).rejects.toThrow('Unresolved duplicate conflicts remaining');
  });

  it('should apply per-row decisions when duplicateStrategy is Ask me', async () => {
    const existingMed = {
      id: 'med-existing-4',
      name: 'Pantoprazole 40mg',
      barcode: '7777777777777',
      categoryId: null,
    };

    const existingBatch = {
      id: 'batch-existing-4',
      medicineId: existingMed.id,
      batchNumber: 'BATCH-PANTO-1',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);
    mockPrisma.medicineCategory.findMany.mockResolvedValue([{ id: 'cat-gastro', name: 'Gastro' }]);

    const importPayload = {
      medicines: [
        {
          name: 'Pantoprazole 40mg',
          barcode: '7777777777777',
          qty: '60',
          price: '40.00',
          batch: 'BATCH-PANTO-1',
          category: 'Gastro',
        },
      ],
      duplicateStrategy: 'Ask me',
      duplicateDecisions: {
        1: { action: 'OVERWRITE' },
      },
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.overwritten).toBe(1);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.skipped).toBe(0);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
    expect(callArgs.medicineUpdates).toHaveLength(1);
    expect(callArgs.medicineUpdates[0].id).toBe('med-existing-4');
    expect(callArgs.medicineUpdates[0].data.categoryId).toBe('cat-gastro');
  });

  it('should reject unmatched rows when importType is Update Existing', async () => {
    mockPrisma.medicine.findMany.mockResolvedValue([]); // Medicine not in DB
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

    const importPayload = {
      medicines: [
        {
          name: 'NonExistent Medicine 100mg',
          qty: '30',
          price: '50.00',
        },
      ],
      importType: 'Update Existing',
      duplicateStrategy: 'Skip',
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.failed).toBe(1);
    expect(result.summary.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errorCode).toBe('RECORD_NOT_FOUND');
  });

  // PRD §10 Acceptance Test Cases

  it('TC-IMP-01: Skip Strategy with 70 new, 25 duplicates, 5 errors -> 70 created, 25 skipped, 5 failed (total: 100)', async () => {
    const existingMeds = [];
    const existingBatches = [];
    const medicines = [];

    // 25 existing medicines with duplicate batches
    for (let i = 1; i <= 25; i++) {
      const medId = `med-dup-${i}`;
      existingMeds.push({
        id: medId,
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
      });
      existingBatches.push({
        id: `batch-dup-${i}`,
        medicineId: medId,
        batchNumber: `BATCH-D-${i}`,
        quantity: 10,
        purchasePrice: 20,
      });
      medicines.push({
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
        qty: '10',
        price: '20.00',
        batch: `BATCH-D-${i}`,
      });
    }

    // 70 new medicines
    for (let i = 1; i <= 70; i++) {
      medicines.push({
        name: `New Med ${i}`,
        qty: '15',
        price: '30.00',
        batch: `BATCH-N-${i}`,
      });
    }

    // 5 validation error rows (e.g. invalid price or zero quantity)
    for (let i = 1; i <= 5; i++) {
      medicines.push({
        name: `Invalid Med ${i}`,
        qty: '0', // Invalid quantity
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Skip',
      },
      tenantId,
      branchId,
      userId,
    );

    expect(result.summary.total).toBe(100);
    expect(result.summary.created).toBe(70);
    expect(result.summary.skipped).toBe(25);
    expect(result.summary.failed).toBe(5);
    expect(result.summary.imported).toBe(70);
    expect(result.summary.total).toBe(
      result.summary.imported + result.summary.skipped + result.summary.failed,
    );
  });

  it('TC-IMP-02: Overwrite Strategy with 70 new, 25 duplicates, 5 errors -> 70 created, 25 updated, 0 skipped, 5 failed (total: 100)', async () => {
    const existingMeds = [];
    const existingBatches = [];
    const medicines = [];

    for (let i = 1; i <= 25; i++) {
      const medId = `med-dup-${i}`;
      existingMeds.push({
        id: medId,
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
      });
      existingBatches.push({
        id: `batch-dup-${i}`,
        medicineId: medId,
        batchNumber: `BATCH-D-${i}`,
        quantity: 10,
        purchasePrice: 20,
      });
      medicines.push({
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
        qty: '15',
        price: '25.00',
        batch: `BATCH-D-${i}`,
      });
    }

    for (let i = 1; i <= 70; i++) {
      medicines.push({
        name: `New Med ${i}`,
        qty: '15',
        price: '30.00',
        batch: `BATCH-N-${i}`,
      });
    }

    for (let i = 1; i <= 5; i++) {
      medicines.push({
        name: `Invalid Med ${i}`,
        qty: '0',
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Overwrite',
      },
      tenantId,
      branchId,
      userId,
    );

    expect(result.summary.total).toBe(100);
    expect(result.summary.created).toBe(70);
    expect(result.summary.updated).toBe(25);
    expect(result.summary.overwritten).toBe(25);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.failed).toBe(5);
    expect(result.summary.imported).toBe(95);
    expect(result.summary.total).toBe(
      result.summary.imported + result.summary.skipped + result.summary.failed,
    );
  });

  it('TC-IMP-03: Merge Strategy with 70 new, 25 duplicates, 5 errors -> 70 created, 25 enriched, 0 skipped, 5 failed (total: 100)', async () => {
    const existingMeds = [];
    const existingBatches = [];
    const medicines = [];

    for (let i = 1; i <= 25; i++) {
      const medId = `med-dup-${i}`;
      existingMeds.push({
        id: medId,
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
      });
      existingBatches.push({
        id: `batch-dup-${i}`,
        medicineId: medId,
        batchNumber: `BATCH-D-${i}`,
        quantity: 10,
        purchasePrice: 20,
      });
      medicines.push({
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
        qty: '10',
        price: '20.00',
        batch: `BATCH-D-${i}`,
      });
    }

    for (let i = 1; i <= 70; i++) {
      medicines.push({
        name: `New Med ${i}`,
        qty: '15',
        price: '30.00',
      });
    }

    for (let i = 1; i <= 5; i++) {
      medicines.push({
        name: `Invalid Med ${i}`,
        qty: '0',
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Merge',
      },
      tenantId,
      branchId,
      userId,
    );

    expect(result.summary.total).toBe(100);
    expect(result.summary.created).toBe(70);
    expect(result.summary.updated).toBe(25);
    expect(result.summary.merged).toBe(25);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.failed).toBe(5);
    expect(result.summary.imported).toBe(95);
    expect(result.summary.total).toBe(
      result.summary.imported + result.summary.skipped + result.summary.failed,
    );
  });

  it('TC-IMP-05: Ask Me with resolved decisions (15 Skip, 5 Overwrite, 5 Merge) -> 70 created, 15 skipped, 5 overwritten, 5 merged, 5 failed (total: 100)', async () => {
    const existingMeds = [];
    const existingBatches = [];
    const medicines = [];
    const duplicateDecisions = {};

    for (let i = 1; i <= 25; i++) {
      const medId = `med-dup-${i}`;
      existingMeds.push({
        id: medId,
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
      });
      existingBatches.push({
        id: `batch-dup-${i}`,
        medicineId: medId,
        batchNumber: `BATCH-D-${i}`,
        quantity: 10,
        purchasePrice: 20,
      });
      medicines.push({
        name: `Dup Med ${i}`,
        barcode: `BAR-DUP-${i}`,
        qty: '10',
        price: '20.00',
        batch: `BATCH-D-${i}`,
      });

      // Rows 1-15: Skip, Rows 16-20: Overwrite, Rows 21-25: Merge
      if (i <= 15) {
        duplicateDecisions[i] = { action: 'SKIP' };
      } else if (i <= 20) {
        duplicateDecisions[i] = { action: 'OVERWRITE' };
      } else {
        duplicateDecisions[i] = { action: 'MERGE' };
      }
    }

    for (let i = 1; i <= 70; i++) {
      medicines.push({
        name: `New Med ${i}`,
        qty: '15',
        price: '30.00',
      });
    }

    for (let i = 1; i <= 5; i++) {
      medicines.push({
        name: `Invalid Med ${i}`,
        qty: '0',
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Ask me',
        duplicateDecisions,
      },
      tenantId,
      branchId,
      userId,
    );

    expect(result.summary.total).toBe(100);
    expect(result.summary.created).toBe(70);
    expect(result.summary.skipped).toBe(15);
    expect(result.summary.overwritten).toBe(5);
    expect(result.summary.merged).toBe(5);
    expect(result.summary.updated).toBe(10);
    expect(result.summary.failed).toBe(5);
    expect(result.summary.imported).toBe(80);
    expect(result.summary.total).toBe(
      result.summary.imported + result.summary.skipped + result.summary.failed,
    );
  });

  it('TC-IMP-07: New batch for existing medicine -> recognized as NEW BATCH, created as new InventoryBatch, not skipped under Skip Duplicates', async () => {
    const existingMed = {
      id: 'med-amox-1',
      name: 'Amoxicillin 500mg',
      barcode: '1234567890123',
    };

    // Existing batch in DB is BATCH-OLD-001
    const existingBatch = {
      id: 'batch-amox-1',
      medicineId: existingMed.id,
      batchNumber: 'BATCH-OLD-001',
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

    // Import file contains the same medicine, but with a NEW batch BATCH-NEW-002
    const importPayload = {
      medicines: [
        {
          name: 'Amoxicillin 500mg',
          barcode: '1234567890123',
          qty: '100',
          price: '30.00',
          batch: 'BATCH-NEW-002',
        },
      ],
      duplicateStrategy: 'Skip', // Would erroneously skip under flawed logic
    };

    // Analyze first
    const analysis = await bulkImportService.analyze(importPayload, tenantId, branchId, userId);
    expect(analysis.summary.new).toBe(1);
    expect(analysis.summary.duplicates).toBe(0);
    expect(analysis.rows).toHaveLength(0); // Not flagged as a duplicate row

    // Commit
    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.created).toBe(1);
    expect(result.summary.skipped).toBe(0);
    expect(result.summary.imported).toBe(1);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
    // No new medicine created (existing med reused)
    expect(callArgs.newMedicines).toHaveLength(0);
    // New inventory batch created under the existing medicine ID!
    expect(callArgs.newBatches).toHaveLength(1);
    expect(callArgs.newBatches[0].medicineId).toBe('med-amox-1');
    expect(callArgs.newBatches[0].batchNumber).toBe('BATCH-NEW-002');
    expect(callArgs.newBatches[0].quantity).toBe(100);
  });

  it('should queue import job when queued option is true', async () => {
    const importPayload = {
      medicines: [
        {
          name: 'Paracetamol 500mg',
          qty: '10',
          price: '5.00',
        },
      ],
      fileName: 'test.csv',
    };

    mockPrisma.importJob.create.mockResolvedValue({ id: 'job-123' });

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId, {
      queued: true,
    });

    expect(result).toEqual({
      success: true,
      queued: true,
      jobId: 'job-123',
      status: 'queued',
      total: 1,
      message: 'Bulk import queued for processing.',
    });

    expect(mockMainQueue.add).toHaveBeenCalledWith('bulk-medicines-bulk-commit', {
      jobId: 'job-123',
      tenantId,
      branchId,
      userId,
    });
  });

  it('should execute queued commit via processQueuedCommit', async () => {
    const importPayload = {
      medicines: [
        {
          name: 'Paracetamol 500mg',
          qty: '10',
          price: '5.00',
        },
      ],
    };

    mockPrisma.importJob.findFirst.mockResolvedValue({
      id: 'job-123',
      tenantId,
      extractedData: importPayload,
    });

    const result = await bulkImportService.processQueuedCommit(
      'job-123',
      tenantId,
      branchId,
      userId,
    );

    expect(result.success).toBe(true);
    expect(mockSharedEngine.commitChunks).toHaveBeenCalled();
    expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-123' },
        data: expect.objectContaining({
          importStatus: 'COMPLETED',
        }),
      }),
    );
  });
});
