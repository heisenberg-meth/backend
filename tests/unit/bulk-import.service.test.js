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
  medicine: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  inventoryBatch: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockImplementation(async () => {
      const batches = await mockPrisma.inventoryBatch.findMany();
      return Array.isArray(batches) ? batches.length : 0;
    }),
  },
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
    mockPrisma.medicine.count.mockResolvedValue(0);
    mockPrisma.medicine.findMany.mockResolvedValue([]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
    mockPrisma.inventoryBatch.count.mockImplementation(async () => {
      const batches = await mockPrisma.inventoryBatch.findMany();
      return Array.isArray(batches) ? batches.length : 0;
    });
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
      processExistingMedicines: true,
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
      processExistingMedicines: true,
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
      processExistingMedicines: true,
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

    // 5 validation error rows (negative quantity rejected per PRD Addendum §3.1)
    for (let i = 1; i <= 5; i++) {
      medicines.push({
        name: `Invalid Med ${i}`,
        qty: '-10', // Negative quantity is invalid
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
        qty: '-10',
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Overwrite',
        processExistingMedicines: true,
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
        qty: '-10',
        price: '10.00',
      });
    }

    mockPrisma.medicine.findMany.mockResolvedValue(existingMeds);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue(existingBatches);

    const result = await bulkImportService.commit(
      {
        medicines,
        duplicateStrategy: 'Merge',
        processExistingMedicines: true,
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
        qty: '-10',
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
        processExistingMedicines: true,
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
      processExistingMedicines: true,
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

  it('PRD §24: Merge duplicate strategy with new batch creates a new batch under existing medicine', async () => {
    const existingMed = {
      id: 'med-para-1',
      name: 'Paracetamol 500mg',
      barcode: '9999999999991',
    };

    const existingBatch = {
      id: 'batch-para-old',
      medicineId: existingMed.id,
      batchNumber: 'BATCH001',
      quantity: 100,
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

    const importPayload = {
      medicines: [
        {
          name: 'Paracetamol 500mg',
          barcode: '9999999999991',
          qty: '50',
          price: '20.00',
          batch: 'BATCH002', // Genuinely different batch number (PRD §24)
          isDuplicate: true,
          rowNum: 1,
        },
      ],
      duplicateStrategy: 'Merge',
      processExistingMedicines: true,
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.merged).toBe(1);
    expect(result.summary.created).toBe(0); // No new medicine created
    expect(result.summary.imported).toBe(1);
    expect(result.summary.total).toBe(1);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
    // No new medicines in catalog
    expect(callArgs.newMedicines).toHaveLength(0);
    // Genuinely new batch created for the existing medicine
    expect(callArgs.newBatches).toHaveLength(1);
    expect(callArgs.newBatches[0].medicineId).toBe('med-para-1');
    expect(callArgs.newBatches[0].batchNumber).toBe('BATCH002');
    expect(callArgs.newBatches[0].quantity).toBe(50);
    expect(callArgs.newMovements).toHaveLength(1);
    expect(callArgs.newMovements[0].notes).toContain('Duplicate resolved via MERGE');
  });

  it('PRD §27: Overwrite duplicate strategy with new batch creates a new batch and updates medicine fields', async () => {
    const existingMed = {
      id: 'med-para-2',
      name: 'Paracetamol 500mg',
      barcode: '9999999999992',
      genericName: 'Old Generic',
    };

    const existingBatch = {
      id: 'batch-para-old-2',
      medicineId: existingMed.id,
      batchNumber: 'BATCH001',
      quantity: 100,
    };

    mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
    mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);

    const importPayload = {
      medicines: [
        {
          name: 'Paracetamol 500mg',
          barcode: '9999999999992',
          genericName: 'New Paracetamol Generic',
          qty: '50',
          price: '22.00',
          batch: 'BATCH002', // Different batch number (PRD §27)
          isDuplicate: true,
          rowNum: 1,
        },
      ],
      duplicateStrategy: 'Overwrite',
      processExistingMedicines: true,
      supplier: 'Global Pharma',
      barcodeOptions: { autoGen: false, overwrite: false },
    };

    const result = await bulkImportService.commit(importPayload, tenantId, branchId, userId);

    expect(result.success).toBe(true);
    expect(result.summary.overwritten).toBe(1);
    expect(result.summary.created).toBe(0);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.total).toBe(1);

    const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
    expect(callArgs.newMedicines).toHaveLength(0);
    // Master field updated
    expect(callArgs.medicineUpdates).toHaveLength(1);
    expect(callArgs.medicineUpdates[0].id).toBe('med-para-2');
    expect(callArgs.medicineUpdates[0].data.genericName).toBe('New Paracetamol Generic');
    // New batch created
    expect(callArgs.newBatches).toHaveLength(1);
    expect(callArgs.newBatches[0].medicineId).toBe('med-para-2');
    expect(callArgs.newBatches[0].batchNumber).toBe('BATCH002');
    expect(callArgs.newBatches[0].quantity).toBe(50);
    expect(callArgs.newMovements[0].notes).toContain('Duplicate resolved via OVERWRITE');
  });

  describe('PRD — Process Existing Medicines Checkbox', () => {
    const existingMed = {
      id: 'med-exist-test',
      name: 'Existing Pan 40',
      barcode: '9990001112223',
    };
    const existingBatch = {
      id: 'batch-exist-test',
      medicineId: 'med-exist-test',
      batchNumber: 'BATCH-EX-1',
      quantity: 50,
      purchasePrice: 20,
    };

    beforeEach(() => {
      mockPrisma.medicine.findMany.mockResolvedValue([existingMed]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([existingBatch]);
    });

    it('skips existing medicines when processExistingMedicines is false, even if duplicateStrategy is Overwrite', async () => {
      const payload = {
        medicines: [
          {
            name: 'Existing Pan 40',
            barcode: '9990001112223',
            qty: '20',
            price: '25.00',
            batch: 'BATCH-EX-1',
          },
        ],
        duplicateStrategy: 'Overwrite',
        processExistingMedicines: false,
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.overwritten).toBe(0);
      expect(result.summary.imported).toBe(0);

      const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
      expect(callArgs.newMedicines).toHaveLength(0);
      expect(callArgs.newBatches).toHaveLength(0);
      expect(callArgs.medicineUpdates).toHaveLength(0);
      expect(callArgs.batchQuantityUpdates).toHaveLength(0);
    });

    it('skips existing medicines by default when processExistingMedicines is omitted', async () => {
      const payload = {
        medicines: [
          {
            name: 'Existing Pan 40',
            barcode: '9990001112223',
            qty: '20',
            price: '25.00',
            batch: 'BATCH-EX-1',
          },
        ],
        duplicateStrategy: 'Merge',
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.merged).toBe(0);
      expect(result.summary.imported).toBe(0);
    });

    it('skips existing medicines without raising unresolved conflict when duplicateStrategy is Ask me and checkbox is false', async () => {
      const payload = {
        medicines: [
          {
            name: 'Existing Pan 40',
            barcode: '9990001112223',
            qty: '20',
            price: '25.00',
            batch: 'BATCH-EX-1',
          },
        ],
        duplicateStrategy: 'Ask me',
        duplicateDecisions: {},
        processExistingMedicines: false,
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.imported).toBe(0);
    });

    it('processes existing medicines using duplicateStrategy when processExistingMedicines is true', async () => {
      const payload = {
        medicines: [
          {
            name: 'Existing Pan 40',
            barcode: '9990001112223',
            qty: '30',
            price: '22.00',
            batch: 'BATCH-EX-1',
          },
        ],
        duplicateStrategy: 'Overwrite',
        processExistingMedicines: true,
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.overwritten).toBe(1);
      expect(result.summary.skipped).toBe(0);
      expect(result.summary.imported).toBe(1);

      const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
      expect(callArgs.batchQuantityUpdates).toHaveLength(1);
      expect(callArgs.batchQuantityUpdates[0].batchId).toBe('batch-exist-test');
    });

    it('always rejects expired incoming products regardless of processExistingMedicines', async () => {
      const payload = {
        medicines: [
          {
            name: 'Existing Pan 40',
            barcode: '9990001112223',
            qty: '30',
            price: '22.00',
            expiry: '2020-01-01',
            batch: 'BATCH-EX-1',
          },
        ],
        duplicateStrategy: 'Overwrite',
        processExistingMedicines: true,
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.summary.failed).toBe(1);
      expect(result.summary.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('EXPIRED_DATE');
      expect(result.errors[0].message).toContain('Expiry date cannot be in the past');

      const callArgs = mockSharedEngine.commitChunks.mock.calls[0][0];
      expect(callArgs.newBatches).toHaveLength(0);
      expect(callArgs.batchQuantityUpdates).toHaveLength(0);
    });

    it('creates new medicines regardless of processExistingMedicines setting', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

      const payload = {
        medicines: [
          {
            name: 'Brand New Medicine 10mg',
            qty: '100',
            price: '15.00',
            batch: 'BATCH-NEW-1',
          },
        ],
        processExistingMedicines: false,
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.created).toBe(1);
      expect(result.summary.imported).toBe(1);
      expect(result.summary.skipped).toBe(0);
    });
  });

  describe('PRD Intelligent First-Time & Duplicate-Aware Import Flow', () => {
    it('determines EMPTY inventory state when inventory batch count is 0', async () => {
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.count.mockResolvedValue(0);

      const state = await bulkImportService.getInventoryState(tenantId, branchId);
      expect(state.success).toBe(true);
      expect(state.inventoryState).toBe('EMPTY');
      expect(state.existingMedicineCount).toBe(0);
      expect(state.requiresDuplicateStrategy).toBe(false);
      expect(state.recommendedStrategy).toBe('DIRECT_IMPORT');
    });

    it('determines EMPTY inventory state when inventory has 0 batches even if medicine catalog has 100 records (PRD §1 & §6)', async () => {
      // PRD Core Bug Scenario: 100 catalog medicines, but 0 inventory batches
      mockPrisma.medicine.count.mockResolvedValue(100);
      mockPrisma.medicine.findMany.mockResolvedValue(new Array(100).fill({ id: 'med-id' }));
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.count.mockResolvedValue(0);

      const state = await bulkImportService.getInventoryState(tenantId, branchId);
      expect(state.success).toBe(true);
      expect(state.inventoryState).toBe('EMPTY');
      expect(state.existingMedicineCount).toBe(0);
      expect(state.requiresDuplicateStrategy).toBe(false);
      expect(state.recommendedStrategy).toBe('DIRECT_IMPORT');
    });

    it('determines EXISTING inventory state when inventory batch count is > 0', async () => {
      mockPrisma.inventoryBatch.count.mockResolvedValue(42);

      const state = await bulkImportService.getInventoryState(tenantId, branchId);
      expect(state.success).toBe(true);
      expect(state.inventoryState).toBe('EXISTING');
      expect(state.existingMedicineCount).toBe(42);
      expect(state.requiresDuplicateStrategy).toBe(true);
      expect(state.recommendedStrategy).toBe('SKIP');
    });

    it('analyzes empty inventory and returns DIRECT_IMPORT without requiring duplicate strategy', async () => {
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

      const payload = {
        medicines: [
          {
            name: 'Paracetamol 500mg',
            qty: '100',
            price: '10.00',
            batch: 'BATCH-A1',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.inventoryState).toBe('EMPTY');
      expect(result.existingMedicineCount).toBe(0);
      expect(result.requiresDuplicateStrategy).toBe(false);
      expect(result.recommendedStrategy).toBe('DIRECT_IMPORT');
      expect(result.summary.inventoryState).toBe('EMPTY');
      expect(result.summary.new).toBe(1);
      expect(result.summary.duplicates).toBe(0);
    });

    it('detects intra-file duplicate rows even on empty inventory (PRD §52)', async () => {
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

      const payload = {
        medicines: [
          {
            name: 'Paracetamol 500mg',
            qty: '100',
            price: '10.00',
            batch: 'BATCH-A1',
          },
          {
            name: 'Paracetamol 500mg',
            qty: '50',
            price: '10.00',
            batch: 'BATCH-A1', // Same name + batch in uploaded file
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorCode).toBe('INTERNAL_DUPLICATE');
      expect(result.errors[0].row).toBe(2);
    });

    it('commits direct import on empty inventory without requiring duplicate decisions', async () => {
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);

      const payload = {
        medicines: [
          {
            name: 'Cetirizine 10mg',
            qty: '50',
            price: '5.00',
            batch: 'BATCH-C1',
          },
        ],
        // Note: No duplicateStrategy provided because user is on empty inventory
      };

      const result = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.summary.created).toBe(1);
      expect(result.summary.imported).toBe(1);
      expect(result.summary.inventoryState).toBe('EMPTY');
      expect(result.summary.existingMedicineCount).toBe(0);
    });
  });

  describe('PRD Addendum — Import Validation, Failed Records & Error Reporting', () => {
    beforeEach(() => {
      mockPrisma.medicine.count.mockResolvedValue(0);
      mockPrisma.medicine.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
    });

    it('PRD Addendum §3.1: accepts quantity 0 as valid', async () => {
      const payload = {
        medicines: [
          {
            name: 'Paracetamol 500mg',
            qty: '0',
            price: '10.00',
            batch: 'BATCH-001',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.validRows).toBe(1);
      expect(result.summary.invalidRows).toBe(0);
    });

    it('PRD Addendum §3.1: rejects negative quantity with INVALID_QUANTITY', async () => {
      const payload = {
        medicines: [
          {
            name: 'Paracetamol 500mg',
            qty: '-20',
            price: '10.00',
            batch: 'BATCH-001',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_QUANTITY');
      expect(result.errors[0].errorCode).toBe('INVALID_QUANTITY');
      expect(result.errors[0].message).toContain('Quantity must be 0 or more');
      expect(result.errors[0].action).toContain('Change the quantity to 0 or a positive number');
      expect(result.errors[0].category).toBe('Quantity');
    });

    it('PRD Addendum §3.1: rejects missing quantity with MISSING_QUANTITY', async () => {
      const payload = {
        medicines: [
          {
            name: 'Paracetamol 500mg',
            qty: '',
            price: '10.00',
            batch: 'BATCH-001',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_QUANTITY');
      expect(result.errors[0].message).toBe('Quantity is required');
    });

    it("PRD Addendum §4: allows today's expiry date, rejects strictly past expiry date", async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const payload = {
        medicines: [
          {
            name: 'Amoxicillin 250mg',
            qty: '10',
            price: '15.00',
            batch: 'AMX-TODAY',
            expiry: todayStr,
          },
          {
            name: 'Ibuprofen 400mg',
            qty: '10',
            price: '12.00',
            batch: 'IBU-PAST',
            expiry: yesterdayStr,
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].medicineName).toBe('Ibuprofen 400mg');
      expect(result.errors[0].code).toBe('EXPIRED_DATE');
      expect(result.errors[0].message).toBe('Expiry date cannot be in the past');
      expect(result.errors[0].category).toBe('Expiry');
    });

    it('PRD Addendum §6: multi-error collection captures all errors for a single row', async () => {
      const payload = {
        medicines: [
          {
            name: 'Paracetamol',
            qty: '-10',
            expiry: '2024-01-01',
            price: '10.00',
            batch: 'B001',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);

      const rowError = result.errors[0];
      expect(rowError.rowNumber).toBe(1);
      expect(rowError.medicineName).toBe('Paracetamol');
      expect(rowError.batchNumber).toBe('B001');
      expect(rowError.errors).toHaveLength(2);

      const errorCodes = rowError.errors.map((e) => e.code);
      expect(errorCodes).toContain('INVALID_QUANTITY');
      expect(errorCodes).toContain('EXPIRED_DATE');

      expect(rowError.message).toContain('Quantity must be 0 or more');
      expect(rowError.message).toContain('Expiry date cannot be in the past');
    });

    it('PRD Addendum §7: rejects MRP below purchase price and selling price above MRP', async () => {
      const payload = {
        medicines: [
          {
            name: 'Cough Syrup',
            qty: '10',
            price: '100.00',
            mrp: '80.00',
            batch: 'CS01',
          },
          {
            name: 'Eye Drops',
            qty: '10',
            price: '50.00',
            mrp: '60.00',
            sellingPrice: '75.00',
            batch: 'ED01',
          },
        ],
      };

      const result = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(2);

      expect(result.errors[0].code).toBe('MRP_BELOW_PURCHASE_PRICE');
      expect(result.errors[0].category).toBe('Pricing');

      expect(result.errors[1].code).toBe('SELLING_PRICE_ABOVE_MRP');
      expect(result.errors[1].category).toBe('Pricing');
    });

    it('PRD Core Acceptance Test (AC-01 to AC-03): 100 catalog medicines, 0 inventory stock -> 77 imported, 0 skipped, 23 failed', async () => {
      // Setup: 100 medicines exist in catalog, but 0 batches exist in inventory (Total SKU = 0)
      const catalogMedicines = [];
      for (let i = 1; i <= 100; i++) {
        catalogMedicines.push({
          id: `cat-med-${i}`,
          name: `Medicine ${i}`,
          barcode: `BARCODE-${i}`,
          categoryId: 'cat-1',
          manufacturerId: 'mfr-1',
        });
      }
      mockPrisma.medicine.count.mockResolvedValue(100);
      mockPrisma.medicine.findMany.mockResolvedValue(catalogMedicines);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([]);
      mockPrisma.inventoryBatch.count.mockResolvedValue(0);

      // 100 CSV rows: 77 valid (matching catalog medicines), 23 invalid (invalid quantities or expired)
      const csvRows = [];
      for (let i = 1; i <= 77; i++) {
        csvRows.push({
          name: `Medicine ${i}`,
          barcode: `BARCODE-${i}`,
          qty: '20',
          price: '50.00',
          batch: `BATCH-${i}`,
          expiry: '2028-12-31',
        });
      }
      for (let i = 78; i <= 100; i++) {
        csvRows.push({
          name: `Medicine ${i}`,
          barcode: `BARCODE-${i}`,
          qty: '-5', // Invalid negative quantity
          price: '50.00',
          batch: `BATCH-${i}`,
          expiry: '2024-01-01', // Expired
        });
      }

      const payload = {
        medicines: csvRows,
        duplicateStrategy: 'Skip', // User selected or defaulted to Skip
        processExistingMedicines: false, // Checkbox was false as shown in user's screenshot
      };

      // 1. Analyze / Dry-run verification
      const dryRun = await bulkImportService.analyze(payload, tenantId, branchId, userId);
      expect(dryRun.success).toBe(true);
      expect(dryRun.inventoryState).toBe('EMPTY');
      expect(dryRun.summary.inventoryState).toBe('EMPTY');
      expect(dryRun.summary.new).toBe(77);
      expect(dryRun.summary.duplicates).toBe(0);
      expect(dryRun.summary.willSkip).toBe(0); // 0 skipped in preview!
      expect(dryRun.summary.validRows).toBe(77);
      expect(dryRun.summary.invalidRows).toBe(23);
      expect(dryRun.summary.errors).toBe(23);

      // 2. Commit execution verification
      const commitResult = await bulkImportService.commit(payload, tenantId, branchId, userId);
      expect(commitResult.success).toBe(true);
      expect(commitResult.status).toBe('COMPLETED_WITH_ERRORS');

      // PRD Strict Requirement: 77 imported, 0 skipped, 23 failed
      expect(commitResult.summary.total).toBe(100);
      expect(commitResult.summary.imported).toBe(77);
      expect(commitResult.summary.created).toBe(77);
      expect(commitResult.summary.skipped).toBe(0); // ZERO SKIPPED!
      expect(commitResult.summary.failed).toBe(23);
      expect(commitResult.summary.duplicates).toBe(0);

      // PRD §14: Row-level error breakdown for all 23 failed records
      expect(commitResult.failedRecords).toHaveLength(23);
      commitResult.failedRecords.forEach((err, idx) => {
        expect(err.rowNumber).toBe(78 + idx);
        expect(err.medicineName).toBe(`Medicine ${78 + idx}`);
        expect(err.reason).toContain('Quantity must be 0 or more');
      });
    });
  });
});
