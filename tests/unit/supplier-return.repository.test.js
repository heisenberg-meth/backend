import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  supplierReturn: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const { default: supplierReturnRepository } =
  await import('../../src/modules/supplier-returns/repository/supplier-return.repository.js');

describe('SupplierReturnRepository - createReturn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call prisma.supplierReturn.create without purchaseInvoiceItemId', async () => {
    const returnData = {
      tenantId: 'tenant-1',
      supplierId: 'supp-1',
      purchaseInvoiceId: 'pinv-1',
      returnNumber: 'RET-2026-00001',
      notes: 'Test return',
      reason: 'DAMAGED',
    };

    const items = [
      {
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 10,
        expiryDate: new Date('2026-12-31'),
        purchasePrice: 50,
        gstPercentage: 18,
        subtotal: 500,
        gstAmount: 90,
        totalAmount: 590,
        lossAmount: 0,
        reason: 'DAMAGED',
      },
    ];

    mockPrisma.supplierReturn.create.mockResolvedValue({
      id: 'ret-1',
      ...returnData,
      returnAmount: 590,
    });

    const result = await supplierReturnRepository.createReturn(returnData, items, 'user-1');

    expect(result).toBeDefined();
    expect(mockPrisma.supplierReturn.create).toHaveBeenCalledTimes(1);

    const callArgs = mockPrisma.supplierReturn.create.mock.calls[0][0];
    const createdItem = callArgs.data.items.create[0];

    // Ensure purchaseInvoiceItemId is NOT present
    expect(createdItem).not.toHaveProperty('purchaseInvoiceItemId');

    // Ensure all required fields are present
    expect(createdItem).toEqual({
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 10,
      expiryDate: items[0].expiryDate,
      purchasePrice: 50,
      gstPercentage: 18,
      subtotal: 500,
      gstAmount: 90,
      totalAmount: 590,
      lossAmount: 0,
      reason: 'DAMAGED',
    });

    // Ensure purchaseInvoiceId is present on the return record
    expect(callArgs.data.purchaseInvoiceId).toBe('pinv-1');
  });
});
