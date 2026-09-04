import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  supplier: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  branch: { findFirst: jest.fn() },
  medicine: { findMany: jest.fn() },
  purchaseOrder: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  purchaseOrderItem: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));
jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn(),
}));

const { default: purchaseOrderService } =
  await import('../../src/modules/purchase-orders/service/purchase-order.service.js');

describe('PurchaseOrderService.updateDraftOrder', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const poId = 'po-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update a draft PO successfully with updated supplier and items', async () => {
    const existingPo = {
      id: poId,
      tenantId,
      supplierId: 'sup-1',
      branchId: 'branch-1',
      status: 'DRAFT',
      expectedDeliveryDate: new Date('2026-09-01'),
      paymentTermsDays: 30,
      notes: 'Initial notes',
      discountAmount: 0,
      advancePaid: 0,
      items: [],
    };

    mockPrisma.purchaseOrder.findFirst.mockResolvedValue(existingPo);
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-2', name: 'New Supplier' });
    mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-1', name: 'Main Branch' });
    mockPrisma.medicine.findMany.mockResolvedValue([
      {
        id: 'med-1',
        name: 'Paracetamol',
        purchasePrice: 50,
        gstPercentage: 18,
        inventory: [{ currentStock: 20 }],
      },
    ]);

    mockPrisma.purchaseOrder.update.mockResolvedValue({
      ...existingPo,
      supplierId: 'sup-2',
      subtotal: 500,
      gstAmount: 90,
      totalAmount: 590,
      balanceAmount: 590,
      supplier: { id: 'sup-2', name: 'New Supplier' },
    });

    const updatePayload = {
      supplierId: 'sup-2',
      paymentTermsDays: 45,
      items: [{ medicineId: 'med-1', quantity: 10, unitPrice: 50 }],
    };

    const result = await purchaseOrderService.updateDraftOrder(
      tenantId,
      poId,
      userId,
      updatePayload,
    );

    expect(result.supplierId).toBe('sup-2');
    expect(mockPrisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: 'sup-2', tenantId, deletedAt: null },
    });
    expect(mockPrisma.purchaseOrderItem.deleteMany).toHaveBeenCalledWith({
      where: { purchaseOrderId: poId },
    });
    expect(mockPrisma.purchaseOrder.update).toHaveBeenCalled();
  });

  it('should reject updating non-draft status with ConflictError (409)', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
      id: poId,
      tenantId,
      status: 'RECEIVED',
    });

    await expect(
      purchaseOrderService.updateDraftOrder(tenantId, poId, userId, { notes: 'Updated' }),
    ).rejects.toThrow('This purchase order cannot be edited in its current status.');
  });

  it('should reject update if supplier does not exist', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
      id: poId,
      tenantId,
      supplierId: 'sup-1',
      status: 'DRAFT',
    });
    mockPrisma.supplier.findFirst.mockResolvedValue(null);

    await expect(
      purchaseOrderService.updateDraftOrder(tenantId, poId, userId, { supplierId: 'invalid-sup' }),
    ).rejects.toThrow('Supplier not found');
  });

  it('should reject GRN-only fields in PO update payload', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValue({
      id: poId,
      tenantId,
      status: 'DRAFT',
    });

    await expect(
      purchaseOrderService.updateDraftOrder(tenantId, poId, userId, { batchNumber: 'BATCH123' }),
    ).rejects.toThrow("'batchNumber' belongs to Goods Receipt (GRN), not Purchase Order update");
  });
});
