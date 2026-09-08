import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  inventoryBatch: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  purchaseOrder: {
    findFirst: jest.fn(),
  },
};

const mockPurchaseOrderRepository = {
  findById: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule(
  '../../src/modules/purchase-orders/repository/purchase-order.prisma.repository.js',
  () => ({ default: mockPurchaseOrderRepository }),
);
jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));
jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn(),
}));

const { default: purchaseOrderService } =
  await import('../../src/modules/purchase-orders/service/purchase-order.service.js');

describe('PurchaseOrderService.getOrderById batch resolution', () => {
  const tenantId = 'tenant-1';
  const poId = 'po-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return batchId, batchNumber, and expiryDate when item has directly linked batch', async () => {
    mockPurchaseOrderRepository.findById.mockResolvedValue({
      id: poId,
      tenantId,
      orderNumber: 'PO-2026-0001',
      items: [
        {
          id: 'po-item-1',
          medicineId: 'med-1',
          medicineName: 'Actrapid HM',
          quantity: 100,
          receivedQuantity: 83,
          inventoryBatches: [
            {
              id: 'batch-uuid-123',
              batchNumber: 'ACT-001',
              expiryDate: new Date('2027-12-31T00:00:00.000Z'),
            },
          ],
        },
      ],
      goodsReceiptNotes: [],
    });

    const result = await purchaseOrderService.getOrderById(tenantId, poId);

    expect(result.items[0].batchId).toBe('batch-uuid-123');
    expect(result.items[0].batchNumber).toBe('ACT-001');
    expect(result.items[0].expiryDate).toBe('2027-12-31');
  });

  it('should auto-backfill and return batchId when batch has purchaseOrderItemId = NULL', async () => {
    mockPurchaseOrderRepository.findById.mockResolvedValue({
      id: poId,
      tenantId,
      orderNumber: 'PO-2026-0001',
      items: [
        {
          id: 'po-item-actrapid',
          medicineId: '52209f18-bb31-46f5-a21e-15aa8421ab13',
          medicineName: 'Actrapid HM',
          quantity: 100,
          receivedQuantity: 83,
          inventoryBatches: [],
        },
      ],
      goodsReceiptNotes: [
        {
          id: 'grn-1',
          items: [
            {
              purchaseOrderItemId: 'po-item-actrapid',
              medicineId: '52209f18-bb31-46f5-a21e-15aa8421ab13',
              batchNumber: 'ACT-001',
              expiryDate: new Date('2027-12-31T00:00:00.000Z'),
            },
          ],
        },
      ],
    });

    mockPrisma.inventoryBatch.findFirst.mockResolvedValue({
      id: 'batch-actrapid-uuid',
      batchNumber: 'ACT-001',
      expiryDate: new Date('2027-12-31T00:00:00.000Z'),
      purchaseOrderItemId: null,
    });
    mockPrisma.inventoryBatch.update.mockResolvedValue({});

    const result = await purchaseOrderService.getOrderById(tenantId, poId);

    expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith({
      where: { id: 'batch-actrapid-uuid' },
      data: { purchaseOrderItemId: 'po-item-actrapid' },
    });

    expect(result.items[0].batchId).toBe('batch-actrapid-uuid');
    expect(result.items[0].batchNumber).toBe('ACT-001');
    expect(result.items[0].expiryDate).toBe('2027-12-31');
  });
});
