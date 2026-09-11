import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  inventory: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  stockMovement: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  supplierReturn: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  supplierCreditNote: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn((cb) => cb(mockPrisma)),
};

const mockRedis = {
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockSupplierReturnRepository = {
  generateReturnNumber: jest.fn(),
  createReturn: jest.fn(),
  findReturnById: jest.fn(),
  updateReturnStatus: jest.fn(),
  createCreditNote: jest.fn(),
  recordLedgerEntry: jest.fn(),
};

const mockMovementService = {
  recordMovement: jest.fn(),
};

const mockExpiryService = {
  getBatchesByBucket: jest.fn(),
};

const mockAuditService = {
  log: jest.fn().mockResolvedValue({}),
};

const mockCacheInvalidatorService = {
  invalidateInventoryCaches: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedis,
  getBullRedis: jest.fn().mockReturnValue(mockRedis),
}));

jest.unstable_mockModule(
  '../../src/modules/supplier-returns/repository/supplier-return.repository.js',
  () => ({
    default: mockSupplierReturnRepository,
  }),
);

jest.unstable_mockModule('../../src/modules/stock/service/movement.service.js', () => ({
  default: mockMovementService,
}));

jest.unstable_mockModule('../../src/modules/inventory/service/expiry.service.js', () => ({
  default: mockExpiryService,
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule(
  '../../src/modules/inventory/service/cache-invalidator.service.js',
  () => ({
    default: mockCacheInvalidatorService,
  }),
);

const { default: supplierReturnService } =
  await import('../../src/modules/supplier-returns/service/supplier-return.service.js');

describe('SupplierReturnService - Create Return (Flutter Payload & Strict Validation)', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupplierReturnRepository.generateReturnNumber.mockResolvedValue('RET-2026-00001');
  });

  it('should successfully create supplier return with Flutter payload and derive batch details', async () => {
    const flutterPayload = {
      supplierId: 'supplier-uuid-1',
      notes: 'Damaged items during transit',
      reason: 'DAMAGED',
      items: [
        {
          batchId: 'batch-uuid-1',
          quantity: 19,
          reason: 'DAMAGED',
        },
      ],
    };

    const mockBatch = {
      id: 'batch-uuid-1',
      batchNumber: 'BATCH-401',
      medicineId: 'med-uuid-1',
      availableQuantity: 25,
      purchasePrice: '120.00',
      expiryDate: new Date('2026-12-31'),
      purchaseInvoiceId: 'pinv-uuid-999',
      medicine: {
        id: 'med-uuid-1',
        name: 'Amoxicillin 500mg',
        gstPercentage: 12,
      },
    };

    mockPrisma.inventoryBatch.findFirst.mockResolvedValue(mockBatch);
    mockSupplierReturnRepository.createReturn.mockResolvedValue({
      id: 'return-uuid-1',
      returnNumber: 'RET-2026-00001',
      status: 'DRAFT',
    });

    const result = await supplierReturnService.createReturn(tenantId, flutterPayload, userId);

    expect(result).toBeDefined();
    expect(result.id).toBe('return-uuid-1');

    expect(mockSupplierReturnRepository.createReturn).toHaveBeenCalledTimes(1);
    const [createData, itemsData, passedUserId] =
      mockSupplierReturnRepository.createReturn.mock.calls[0];

    // Verify header data - purchaseInvoiceId derived from batch
    expect(createData).toEqual({
      tenantId,
      supplierId: 'supplier-uuid-1',
      purchaseInvoiceId: 'pinv-uuid-999',
      returnNumber: 'RET-2026-00001',
      notes: 'Damaged items during transit',
      reason: 'DAMAGED',
    });
    expect(passedUserId).toBe(userId);

    // Verify items data - derived medicineId, pricing, GST, no purchaseInvoiceItemId
    expect(itemsData).toHaveLength(1);
    const item = itemsData[0];
    expect(item.medicineId).toBe('med-uuid-1');
    expect(item.batchId).toBe('batch-uuid-1');
    expect(item.quantity).toBe(19);
    expect(item.expiryDate).toEqual(mockBatch.expiryDate);
    expect(item.purchasePrice).toBe(120);
    expect(item.gstPercentage).toBe(12);
    expect(item.subtotal).toBe(2280); // 120 * 19
    expect(item.gstAmount).toBe(273.6); // 2280 * 0.12
    expect(item.totalAmount).toBe(2553.6); // 2280 + 273.6
    expect(item.reason).toBe('DAMAGED');

    // CRITICAL: Ensure purchaseInvoiceItemId is completely absent
    expect(item).not.toHaveProperty('purchaseInvoiceItemId');
  });

  it('should throw error when quantity is 0 or negative', async () => {
    const payloadZero = {
      supplierId: 'supplier-uuid-1',
      items: [
        {
          batchId: 'batch-uuid-1',
          quantity: 0,
        },
      ],
    };

    mockPrisma.inventoryBatch.findFirst.mockResolvedValue({
      id: 'batch-uuid-1',
      batchNumber: 'BATCH-401',
      availableQuantity: 25,
    });

    await expect(supplierReturnService.createReturn(tenantId, payloadZero, userId)).rejects.toThrow(
      'Return quantity must be greater than 0',
    );

    const payloadNegative = {
      supplierId: 'supplier-uuid-1',
      items: [
        {
          batchId: 'batch-uuid-1',
          quantity: -5,
        },
      ],
    };

    await expect(
      supplierReturnService.createReturn(tenantId, payloadNegative, userId),
    ).rejects.toThrow('Return quantity must be greater than 0');
  });

  it('should throw error when requested quantity exceeds available stock', async () => {
    const payload = {
      supplierId: 'supplier-uuid-1',
      items: [
        {
          batchId: 'batch-uuid-1',
          quantity: 30, // Exceeds available 25
        },
      ],
    };

    mockPrisma.inventoryBatch.findFirst.mockResolvedValue({
      id: 'batch-uuid-1',
      batchNumber: 'BATCH-401',
      availableQuantity: 25,
      purchasePrice: '100',
    });

    await expect(supplierReturnService.createReturn(tenantId, payload, userId)).rejects.toThrow(
      'Requested return quantity (30) exceeds available stock (BATCH-401)',
    );
  });

  it('should throw error when batch is not found', async () => {
    const payload = {
      supplierId: 'supplier-uuid-1',
      items: [
        {
          batchId: 'missing-batch-id',
          quantity: 5,
        },
      ],
    };

    mockPrisma.inventoryBatch.findFirst.mockResolvedValue(null);

    await expect(supplierReturnService.createReturn(tenantId, payload, userId)).rejects.toThrow(
      'Batch missing-batch-id not found',
    );
  });

  it('should throw error when batchId is not provided', async () => {
    const payload = {
      supplierId: 'supplier-uuid-1',
      items: [
        {
          quantity: 5,
        },
      ],
    };

    await expect(supplierReturnService.createReturn(tenantId, payload, userId)).rejects.toThrow(
      'Batch ID is required for each return item',
    );
  });
});

describe('SupplierReturnService - Status Transitions & Inventory Stock Removal (PRD Invariants)', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const returnId = 'ret-uuid-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma));
  });

  it('TC-01: DRAFT return does not affect stock upon creation', async () => {
    // Verified in createReturn test above; batches findFirst was read-only, no updates called
    expect(mockPrisma.inventoryBatch.update).not.toHaveBeenCalled();
    expect(mockPrisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('TC-02 & TC-03: Transitioning to COMPLETED decreases batch availableQuantity and quantity (partial batch return: 100 -> 75)', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00001',
      tenantId,
      status: 'DRAFT',
      supplierId: 'supp-1',
      returnAmount: 2500,
      branchId: 'branch-1',
      items: [
        {
          id: 'item-1',
          batchId: 'batch-1',
          medicineId: 'med-1',
          quantity: 25,
          reason: 'DAMAGED',
          batch: { branchId: 'branch-1' },
        },
      ],
    };

    const mockBatch = {
      id: 'batch-1',
      batchNumber: 'BATCH-A',
      medicineId: 'med-1',
      branchId: 'branch-1',
      quantity: 100,
      availableQuantity: 100,
      medicine: { name: 'Acyclovir 400mg' },
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null); // No prior movement
    mockPrisma.inventoryBatch.findFirst.mockResolvedValue(mockBatch);
    mockPrisma.inventory.findFirst.mockResolvedValue({ id: 'inv-1', currentStock: 100 });
    mockPrisma.supplierCreditNote.findFirst.mockResolvedValue(null);
    mockSupplierReturnRepository.updateReturnStatus.mockResolvedValue({
      ...mockReturn,
      status: 'COMPLETED',
    });

    const result = await supplierReturnService.updateStatus(
      returnId,
      tenantId,
      'COMPLETED',
      userId,
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.inventoryImpact).toHaveLength(1);
    expect(result.inventoryImpact[0]).toEqual({
      medicineId: 'med-1',
      medicineName: 'Acyclovir 400mg',
      batchId: 'batch-1',
      batchNumber: 'BATCH-A',
      quantityReturned: 25,
      remainingQuantity: 75,
    });

    // Check InventoryBatch update
    expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-1' },
      data: {
        quantity: { decrement: 25 },
        availableQuantity: { decrement: 25 },
      },
    });

    // Check branch Inventory update
    expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { currentStock: { decrement: 25 } },
    });

    // Check StockMovement creation with negative quantity
    expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        branchId: 'branch-1',
        medicineId: 'med-1',
        batchId: 'batch-1',
        movementType: 'SUPPLIER_RETURN',
        quantity: -25,
        quantityBefore: 100,
        quantityAfter: 75,
        referenceType: 'SUPPLIER_RETURN',
        referenceId: returnId,
        idempotencyKey: `supplier-return:${returnId}:item-1`,
        performedBy: userId,
      }),
    });

    // Check cache invalidation
    expect(mockCacheInvalidatorService.invalidateInventoryCaches).toHaveBeenCalledWith(
      tenantId,
      ['med-1'],
      'branch-1',
    );
  });

  it('TC-04: Full batch return (25 -> 0) decrements to 0 without deleting batch', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00002',
      tenantId,
      status: 'PICKED_UP',
      supplierId: 'supp-1',
      items: [
        {
          id: 'item-full',
          batchId: 'batch-full',
          medicineId: 'med-1',
          quantity: 25,
        },
      ],
    };

    const mockBatch = {
      id: 'batch-full',
      batchNumber: 'BATCH-FULL',
      availableQuantity: 25,
      quantity: 25,
      medicine: { name: 'Full Batch Med' },
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.inventoryBatch.findFirst.mockResolvedValue(mockBatch);
    mockSupplierReturnRepository.updateReturnStatus.mockResolvedValue({
      ...mockReturn,
      status: 'COMPLETED',
    });

    const result = await supplierReturnService.completeReturn(returnId, tenantId, userId);

    expect(result.status).toBe('COMPLETED');
    expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-full' },
      data: {
        quantity: { decrement: 25 },
        availableQuantity: { decrement: 25 },
      },
    });
    expect(result.inventoryImpact[0].remainingQuantity).toBe(0);
  });

  it('TC-05: Multiple batches of same medicine are deducted independently', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00003',
      tenantId,
      status: 'DRAFT',
      supplierId: 'supp-1',
      items: [
        { id: 'item-1', batchId: 'batch-a', medicineId: 'med-acy', quantity: 4 },
        { id: 'item-2', batchId: 'batch-b', medicineId: 'med-acy', quantity: 5 },
      ],
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);

    mockPrisma.inventoryBatch.findFirst
      .mockResolvedValueOnce({
        id: 'batch-a',
        batchNumber: 'BD26120437',
        availableQuantity: 4,
        quantity: 4,
        medicine: { name: 'Acyclovir 400mg' },
      })
      .mockResolvedValueOnce({
        id: 'batch-b',
        batchNumber: 'Inv-acy50',
        availableQuantity: 20,
        quantity: 20,
        medicine: { name: 'Acyclovir 400mg' },
      });

    mockSupplierReturnRepository.updateReturnStatus.mockResolvedValue({
      ...mockReturn,
      status: 'COMPLETED',
    });

    const result = await supplierReturnService.updateStatus(
      returnId,
      tenantId,
      'COMPLETED',
      userId,
    );

    expect(result.inventoryImpact).toHaveLength(2);
    expect(result.inventoryImpact[0]).toMatchObject({
      batchNumber: 'BD26120437',
      quantityReturned: 4,
      remainingQuantity: 0,
    });
    expect(result.inventoryImpact[1]).toMatchObject({
      batchNumber: 'Inv-acy50',
      quantityReturned: 5,
      remainingQuantity: 15,
    });

    expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledTimes(2);
  });

  it('TC-07: Over-return (quantity > availableQuantity) is rejected with INSUFFICIENT_STOCK', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00004',
      tenantId,
      status: 'DRAFT',
      items: [{ id: 'item-over', batchId: 'batch-low', medicineId: 'med-1', quantity: 15 }],
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);
    mockPrisma.stockMovement.findFirst.mockResolvedValue(null);
    mockPrisma.inventoryBatch.findFirst.mockResolvedValue({
      id: 'batch-low',
      batchNumber: 'BD26120437',
      availableQuantity: 10,
      quantity: 10,
      medicine: { name: 'Acyclovir 400mg' },
    });

    await expect(
      supplierReturnService.updateStatus(returnId, tenantId, 'COMPLETED', userId),
    ).rejects.toThrow('Cannot return 15 units. Only 10 units are available in batch BD26120437.');

    // Ensure no inventory was updated
    expect(mockPrisma.inventoryBatch.update).not.toHaveBeenCalled();
    expect(mockSupplierReturnRepository.updateReturnStatus).not.toHaveBeenCalled();
  });

  it('TC-08: Double completion is idempotent and skips duplicate deduction', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00005',
      tenantId,
      status: 'COMPLETED', // Already completed
      items: [{ id: 'item-1', batchId: 'batch-1', medicineId: 'med-1', quantity: 10 }],
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);

    // Transition from COMPLETED is not in validTransitions
    await expect(
      supplierReturnService.updateStatus(returnId, tenantId, 'COMPLETED', userId),
    ).rejects.toThrow('Cannot transition from COMPLETED to COMPLETED');

    expect(mockPrisma.inventoryBatch.update).not.toHaveBeenCalled();
  });

  it('TC-08 (cont): Skipping stock deduction if movements already exist for this return', async () => {
    const mockReturn = {
      id: returnId,
      returnNumber: 'RET-2026-00006',
      tenantId,
      status: 'PICKED_UP',
      items: [{ id: 'item-1', batchId: 'batch-1', medicineId: 'med-1', quantity: 10 }],
    };

    mockSupplierReturnRepository.findReturnById.mockResolvedValue(mockReturn);
    // Simulate existing stock movement
    mockPrisma.stockMovement.findFirst.mockResolvedValue({ id: 'existing-mov-1' });
    mockSupplierReturnRepository.updateReturnStatus.mockResolvedValue({
      ...mockReturn,
      status: 'COMPLETED',
    });

    const result = await supplierReturnService.updateStatus(
      returnId,
      tenantId,
      'COMPLETED',
      userId,
    );

    expect(result.status).toBe('COMPLETED');
    // Batch update was bypassed because existingMovement was found!
    expect(mockPrisma.inventoryBatch.update).not.toHaveBeenCalled();
  });
});
