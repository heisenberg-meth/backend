import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  supplier: { findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  branch: { findFirst: jest.fn() },
  medicine: { findMany: jest.fn() },
  purchaseOrder: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  purchaseOrderItem: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  auditLog: { create: jest.fn() },
  goodsReceiptNote: { create: jest.fn() },
  goodsReceiptNoteItem: { create: jest.fn() },
  inventoryBatch: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  inventory: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  stockMovement: { create: jest.fn() },
  purchaseInvoice: { create: jest.fn(), findMany: jest.fn() },
  supplierLedger: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
}));
jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn(),
}));

const { default: purchaseOrderService } = await import(
  '../../src/modules/purchase-orders/service/purchase-order.service.js'
);

describe('PurchaseOrderService.createOrder', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a PO with server-side calculations', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Test Supplier', paymentTermsDays: 30 });
    mockPrisma.user.findUnique.mockResolvedValue({ branchId: 'branch-1' });
    mockPrisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Paracetamol', gstPercentage: 18, inventory: [{ currentStock: 100 }] },
      { id: 'med-2', name: 'Ibuprofen', gstPercentage: 12, inventory: [{ currentStock: 50 }] },
    ]);
    mockPrisma.purchaseOrder.create.mockResolvedValue({
      id: 'po-1',
      orderNumber: 'PO-20260623-0001',
      status: 'DRAFT',
      subtotal: 10550,
      gstAmount: 1872,
      totalAmount: 12322,
      items: [],
      supplier: { id: 'sup-1', name: 'Test Supplier' },
    });

    const result = await purchaseOrderService.createOrder(tenantId, userId, {
      supplierId: 'sup-1',
      items: [
        { medicineId: 'med-1', quantity: 100, unitPrice: 45.50, gstPercentage: 18 },
        { medicineId: 'med-2', quantity: 50, unitPrice: 120, gstPercentage: 12 },
      ],
    });

    expect(result.status).toBe('DRAFT');
    expect(mockPrisma.supplier.findFirst).toHaveBeenCalled();
    expect(mockPrisma.purchaseOrder.create).toHaveBeenCalled();
  });

  it('should reject if supplier not found', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue(null);

    await expect(
      purchaseOrderService.createOrder(tenantId, userId, {
        supplierId: 'invalid',
        items: [{ medicineId: 'med-1', quantity: 10, unitPrice: 10 }],
      })
    ).rejects.toThrow('Supplier not found');
  });

  it('should reject if medicine not found', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Test Supplier' });
    mockPrisma.user.findUnique.mockResolvedValue({ branchId: 'branch-1' });
    mockPrisma.medicine.findMany.mockResolvedValue([]);

    await expect(
      purchaseOrderService.createOrder(tenantId, userId, {
        supplierId: 'sup-1',
        items: [{ medicineId: 'med-999', quantity: 10, unitPrice: 10 }],
      })
    ).rejects.toThrow('Medicine with ID med-999 not found');
  });

  it('should accept purchasePrice as alias for unitPrice', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Test Supplier' });
    mockPrisma.user.findUnique.mockResolvedValue({ branchId: 'branch-1' });
    mockPrisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Paracetamol', gstPercentage: 18, inventory: [] },
    ]);
    mockPrisma.purchaseOrder.create.mockResolvedValue({
      id: 'po-1', orderNumber: 'PO-001', status: 'DRAFT', items: [],
    });

    await purchaseOrderService.createOrder(tenantId, userId, {
      supplierId: 'sup-1',
      items: [{ medicineId: 'med-1', quantity: 10, purchasePrice: 50 }],
    });

    const createCall = mockPrisma.purchaseOrder.create.mock.calls[0][0];
    expect(createCall.data.items.create[0].unitPrice).toBe(50);
  });

  it('should calculate GST correctly', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Test Supplier' });
    mockPrisma.user.findUnique.mockResolvedValue({ branchId: 'branch-1' });
    mockPrisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Test', gstPercentage: 18, inventory: [] },
    ]);
    mockPrisma.purchaseOrder.create.mockResolvedValue({ id: 'po-1', items: [] });

    await purchaseOrderService.createOrder(tenantId, userId, {
      supplierId: 'sup-1',
      items: [{ medicineId: 'med-1', quantity: 100, unitPrice: 100 }],
    });

    const createCall = mockPrisma.purchaseOrder.create.mock.calls[0][0];
    expect(createCall.data.subtotal).toBe(10000);
    expect(createCall.data.gstAmount).toBe(1800);
    expect(createCall.data.totalAmount).toBe(11800);
  });

  it('should apply discount correctly', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1', name: 'Test Supplier' });
    mockPrisma.user.findUnique.mockResolvedValue({ branchId: 'branch-1' });
    mockPrisma.medicine.findMany.mockResolvedValue([
      { id: 'med-1', name: 'Test', gstPercentage: 18, inventory: [] },
    ]);
    mockPrisma.purchaseOrder.create.mockResolvedValue({ id: 'po-1', items: [] });

    await purchaseOrderService.createOrder(tenantId, userId, {
      supplierId: 'sup-1',
      discountAmount: 500,
      items: [{ medicineId: 'med-1', quantity: 100, unitPrice: 100 }],
    });

    const createCall = mockPrisma.purchaseOrder.create.mock.calls[0][0];
    expect(createCall.data.discountAmount).toBe(500);
    expect(createCall.data.totalAmount).toBe(11300);
  });
});
