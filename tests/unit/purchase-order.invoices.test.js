import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  purchaseInvoice: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  goodsReceiptNote: {
    findMany: jest.fn(),
  },
  inventoryBatch: {
    findMany: jest.fn(),
  },
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

describe('PurchaseOrderService.getPurchaseInvoices', () => {
  const tenantId = 'tenant-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should hydrate invoice items directly from inventoryBatches if present', async () => {
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        invoiceNumber: 'PINV-001',
        supplierInvoiceNumber: 'SUP-INV-99',
        totalAmount: 1500,
        gstAmount: 150,
        paymentStatus: 'PAID',
        inventoryBatches: [
          {
            id: 'batch-1',
            batchNumber: 'BAT-001',
            expiryDate: new Date('2027-01-01'),
            purchasePrice: 150,
            quantity: 10,
            medicine: { id: 'med-1', name: 'Paracetamol' },
          },
        ],
        goodsReceiptNote: null,
      },
    ]);
    mockPrisma.purchaseInvoice.count.mockResolvedValue(1);

    const result = await purchaseOrderService.getPurchaseInvoices(tenantId, {});

    expect(result).toHaveLength(1);
    const invoice = result[0];
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0]).toEqual(
      expect.objectContaining({
        medicineName: 'Paracetamol',
        batchNumber: 'BAT-001',
        purchasePrice: 150,
        quantity: 10,
      }),
    );
  });

  it('should hydrate invoice items from GRN items when inventoryBatches is empty', async () => {
    mockPrisma.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'inv-2',
        invoiceNumber: 'PINV-GRN-002',
        supplierInvoiceNumber: 'SUP-INV-100',
        purchaseOrderId: 'po-2',
        totalAmount: 3000,
        gstAmount: 300,
        paymentStatus: 'PENDING',
        inventoryBatches: [],
      },
    ]);
    mockPrisma.purchaseInvoice.count.mockResolvedValue(1);

    mockPrisma.goodsReceiptNote.findMany.mockResolvedValue([
      {
        id: 'grn-2',
        grnNumber: 'GRN-002',
        purchaseOrderId: 'po-2',
        items: [
          {
            id: 'grni-1',
            medicineId: 'med-1',
            medicineName: 'Amoxicillin',
            batchNumber: 'AMX-404',
            expiryDate: new Date('2026-12-31'),
            unitPrice: 50,
            receivedQuantity: 20,
            purchaseOrderItem: {
              medicine: { id: 'med-1', name: 'Amoxicillin' },
            },
          },
          {
            id: 'grni-2',
            medicineId: 'med-2',
            medicineName: 'Cetirizine',
            batchNumber: 'CET-808',
            expiryDate: new Date('2028-06-30'),
            unitPrice: 100,
            receivedQuantity: 20,
            purchaseOrderItem: {
              medicine: { id: 'med-2', name: 'Cetirizine' },
            },
          },
        ],
      },
    ]);

    const result = await purchaseOrderService.getPurchaseInvoices(tenantId, {});

    expect(result).toHaveLength(1);
    const invoice = result[0];
    expect(invoice.items).toHaveLength(2);
    expect(invoice.items[0].batchNumber).toBe('AMX-404');
    expect(invoice.items[0].purchasePrice).toBe(50);
    expect(invoice.items[1].batchNumber).toBe('CET-808');
    expect(invoice.items[1].purchasePrice).toBe(100);
  });
});
