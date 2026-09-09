import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  supplierReturn: {
    create: jest.fn(),
  },
};

const mockRedis = {
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockSupplierReturnRepository = {
  generateReturnNumber: jest.fn(),
  createReturn: jest.fn(),
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

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedis,
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
