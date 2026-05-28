import { jest, describe, it, expect } from '@jest/globals';

// Define mocks first
const mockPrisma = {
  $transaction: jest.fn((cb) =>
    cb({
      branch: { findUnique: jest.fn() },
      patient: { findUnique: jest.fn() },
      medicine: { findFirst: jest.fn() },
      inventoryBatch: { findFirst: jest.fn(), update: jest.fn() },
      invoice: { create: jest.fn() },
      invoicePayment: { create: jest.fn() },
      stockTransaction: { create: jest.fn() },
    }),
  ),
};

// Register unstable mocks
jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
  __esModule: true,
}));

jest.unstable_mockModule('../../../config/redis.js', () => ({
  default: { get: jest.fn(), set: jest.fn(), del: jest.fn(), keys: jest.fn() },
}));

jest.unstable_mockModule('../../stock/service/movement.service.js', () => ({
  default: {
    stockOut: jest.fn().mockResolvedValue({
      totalDeducted: 2,
      deductions: [{ batchId: 'batch-1', quantity: 2, branchId: 'branch-1' }],
    }),
    recordMovement: jest.fn().mockResolvedValue({}),
  },
  __esModule: true,
}));

jest.unstable_mockModule('../../../shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
  erpEventBus: { add: jest.fn(), close: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/constants/events.js', () => ({
  DOMAIN_EVENTS: {
    INVOICE_CREATED: 'invoice.created',
  },
}));

jest.unstable_mockModule('../repositories/invoice.repository.js', () => ({
  default: {
    getNextInvoiceNumber: jest.fn().mockResolvedValue('INV-2026-001'),
  },
  __esModule: true,
}));

// Dynamic Imports
const { default: invoiceEngine } = await import('../invoice-engine/invoice.engine.js');
const { default: prisma } = await import('../../../config/prisma.js');

describe('InvoiceEngine', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  it('should calculate Indian GST correctly (Intrastate)', async () => {
    const data = {
      branchId: 'branch-1',
      items: [
        {
          medicineId: 'med-1',
          quantity: 2,
          unitPrice: 100,
          discountPercentage: 0,
          batchId: 'batch-1',
          medicineName: 'Dolo',
          gstPercentage: 12,
        },
      ],
      payments: [{ paymentMode: 'CASH', amount: 224 }],
      paymentMethod: 'CASH',
    };

    // Same state (Intrastate)
    const mockTx = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'branch-1', gstNumber: '27AAAAA0000A1Z5' }),
      }, // 27 = Maharashtra
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', gstNumber: '27BBBBB0000A1Z5' }),
      }, // 27 = Maharashtra
      storeProfile: { findFirst: jest.fn().mockResolvedValue({ gstin: '27AAAAA0000A1Z5' }) },
      medicine: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'med-1',
          name: 'Dolo',
          unitPrice: 100,
          gstPercentage: 12,
          isActive: true,
          prescriptionRequired: false,
        }),
      },
      invoice: {
        create: jest.fn().mockImplementation((args) => ({ ...args.data, id: 'inv-1' })),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', batchNumber: 'B1', availableQuantity: 100 }),
      },
      invoiceItem: { create: jest.fn() },
      invoicePayment: { create: jest.fn() },
      invoiceAuditLog: { create: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

    const result = await invoiceEngine.createDraft(tenantId, userId, data);

    // Subtotal = 200, GST = 12% = 24.
    // Intrastate: CGST = 12, SGST = 12, IGST = 0.
    expect(result.totalAmount).toBe(224);
    expect(result.cgst).toBe(12);
    expect(result.sgst).toBe(12);
    expect(result.igst).toBe(0);
  });

  it('should calculate Indian GST correctly (Interstate)', async () => {
    const data = {
      branchId: 'branch-1',
      patientId: 'cust-1',
      items: [
        {
          medicineId: 'med-1',
          quantity: 2,
          unitPrice: 100,
          discountPercentage: 0,
          batchId: 'batch-1',
          medicineName: 'Dolo',
          gstPercentage: 18,
        },
      ],
      payments: [{ paymentMode: 'UPI', amount: 236 }],
      paymentMethod: 'UPI',
    };

    // Different state (Interstate)
    const mockTx = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'branch-1', gstNumber: '27AAAAA0000A1Z5' }),
      }, // 27 = Maharashtra
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', gstNumber: '29BBBBB0000A1Z5' }),
      }, // 29 = Karnataka
      storeProfile: { findFirst: jest.fn().mockResolvedValue({ gstin: '27AAAAA0000A1Z5' }) },
      medicine: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'med-1',
          name: 'Dolo',
          unitPrice: 100,
          gstPercentage: 18,
          isActive: true,
          prescriptionRequired: false,
        }),
      },
      invoice: {
        create: jest.fn().mockImplementation((args) => ({ ...args.data, id: 'inv-2' })),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', batchNumber: 'B1', availableQuantity: 100 }),
      },
      invoiceItem: { create: jest.fn() },
      invoicePayment: { create: jest.fn() },
      invoiceAuditLog: { create: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

    const result = await invoiceEngine.createDraft(tenantId, userId, data);

    expect(result.totalAmount).toBe(236);
    expect(result.gstAmount).toBe(36);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(36);
  });
});
