import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
  $queryRaw: jest.fn(async (query) => {
    const queryString = Array.isArray(query) ? query.join('') : String(query);
    if (queryString.includes('SequenceCounter') || queryString.includes('Sequence')) {
      return [{ currentValue: 1 }];
    }
    if (queryString.includes('InventoryBatch')) {
      return [
        {
          id: 'batch-1',
          batchNumber: 'B1',
          availableQuantity: 100,
          status: 'ACTIVE',
          expiryDate: new Date('2030-01-01'),
        },
      ];
    }
    return [];
  }),
  branch: {
    findUnique: jest.fn().mockResolvedValue({ id: 'branch-1', gstNumber: '27AAAAA0000A1Z5' }),
  },
  patient: {
    findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', gstNumber: '27BBBBB0000A1Z5' }),
  },
  storeProfile: {
    findFirst: jest.fn().mockResolvedValue({ id: 'store-1', gstin: '27AAAAA0000A1Z5' }),
  },
  medicine: {
    findFirst: jest.fn().mockResolvedValue({
      id: 'med-1',
      name: 'Test Medicine',
      unitPrice: 100,
      gstPercentage: 12,
      isActive: true,
      prescriptionRequired: false,
    }),
    findUnique: jest.fn().mockResolvedValue({
      id: 'med-1',
      name: 'Test Medicine',
      isActive: true,
      prescriptionRequired: false,
    }),
  },
  invoice: {
    create: jest.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      totalAmount: 560,
      paidAmount: 0,
    }),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'DRAFT',
      branchId: 'branch-1',
      totalAmount: 560,
      paidAmount: 0,
      items: [
        { id: 'item-1', medicineId: 'med-1', quantity: 5, batchId: 'batch-1', totalPrice: 500 },
      ],
    }),
    findUnique: jest.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'FINALIZED',
      branchId: 'branch-1',
      totalAmount: 560,
      paidAmount: 0,
      items: [
        { id: 'item-1', medicineId: 'med-1', quantity: 5, batchId: 'batch-1', totalPrice: 500 },
      ],
    }),
    update: jest.fn().mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'FINALIZED',
      branchId: 'branch-1',
      totalAmount: 560,
      paidAmount: 560,
      paymentStatus: 'PAID',
    }),
  },
  inventoryBatch: {
    findUnique: jest.fn().mockResolvedValue({
      id: 'batch-1',
      batchNumber: 'B1',
      availableQuantity: 100,
      status: 'ACTIVE',
    }),
    findMany: jest
      .fn()
      .mockResolvedValue([
        { id: 'batch-1', batchNumber: 'B1', availableQuantity: 100, status: 'ACTIVE' },
      ]),
    count: jest.fn().mockResolvedValue(1),
  },
  invoiceItem: {
    create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  invoicePayment: {
    create: jest.fn().mockResolvedValue({ id: 'pay-1' }),
  },
  invoiceAuditLog: {
    create: jest.fn().mockResolvedValue({ id: 'log-1' }),
  },
  saleItem: {
    create: jest.fn().mockResolvedValue({ id: 'sale-item-1' }),
  },
  sale: {
    create: jest.fn().mockResolvedValue({
      id: 'sale-1',
      tenantId: 'tenant-1',
      invoiceId: 'inv-1',
      totalAmount: 560,
      status: 'COMPLETED',
      items: [],
    }),

    aggregate: jest.fn().mockResolvedValue({
      _avg: {
        totalAmount: 500,
      },
    }),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/modules/loyalty/points/points.service.js', () => ({
  default: {
    earnPoints: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../src/modules/loyalty/credits/credit.service.js', () => ({
  default: {
    issueCredit: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../src/modules/stock/service/movement.service.js', () => ({
  default: {
    stockOut: jest.fn(),
    recordMovement: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  erpEventBus: { add: jest.fn(), close: jest.fn() },
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../src/shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/constants/events.js', () => ({
  DOMAIN_EVENTS: {
    INVOICE_CREATED: 'invoice.created',
  },
  EVENTS: {
    INVOICE_CREATED: 'invoice.created',
    INVOICE_PDF_GENERATED: 'billing.invoice.pdf_generated',
    INVOICE_PDF_REGENERATED: 'billing.invoice.pdf_regenerated',
    INVOICE_WHATSAPP_SENT: 'billing.invoice.whatsapp_sent',
    INVOICE_EMAIL_SENT: 'billing.invoice.email_sent',
    INVOICE_DELIVERY_FAILED: 'billing.invoice.delivery_failed',
    INVOICE_PRINTED: 'billing.invoice.printed',
    INVOICE_DOWNLOADED: 'billing.invoice.downloaded',
    RETURN_CREATED: 'billing.return.created',
    RETURN_APPROVED: 'billing.return.approved',
    RETURN_REJECTED: 'billing.return.rejected',
    CREDIT_NOTE_GENERATED: 'billing.credit_note.generated',
    REFUND_COMPLETED: 'billing.refund.completed',
    INVENTORY_REVERSED: 'billing.return.inventory_reversed',
    GST_ADJUSTED: 'billing.return.gst_adjusted',
  },
  BILLING_STATUS: {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    PAID: 'PAID',
    PARTIALLY_PAID: 'PARTIALLY_PAID',
    VOIDED: 'VOIDED',
    REFUNDED: 'REFUNDED',
  },
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  initRedis: jest.fn(),
  connectRedis: jest.fn(),
  quitRedis: jest.fn(),
  getBullRedis: jest.fn().mockReturnValue({}),
  default: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    status: 'end',
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/shared/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: billingService } =
  await import('../../src/modules/billing/services/billing.service.js');

describe('BillingService Integration Tests (Checkout)', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process a successful checkout with stock deduction and sale record', async () => {
    const data = {
      items: [
        {
          medicineId: 'med-1',
          quantity: 5,
          batchId: 'batch-1',
          medicineName: 'Test Medicine',
          unitPrice: 100,
          gstPercentage: 12,
        },
      ],
      payments: [{ paymentMode: 'CASH', amount: 560 }],
      paymentMethod: 'CASH',
      branchId: 'branch-1',
    };

    const result = await billingService.checkout(tenantId, data, userId);

    expect(result.id).toBe('inv-1');
  });

  it('should fail checkout if stock is insufficient', async () => {
    const data = {
      items: [
        {
          medicineId: 'med-1',
          quantity: 100,
          batchId: 'batch-1',
          medicineName: 'Test Medicine',
          unitPrice: 10,
          gstPercentage: 5,
        },
      ],
      payments: [{ paymentMode: 'CASH', amount: 1050 }],
      branchId: 'branch-1',
    };

    mockPrisma.inventoryBatch.findMany.mockResolvedValue([
      {
        id: 'batch-1',
        batchNumber: 'B1',
        availableQuantity: 10,
        status: 'ACTIVE',
      },
    ]);

    mockPrisma.invoice.findFirst.mockResolvedValue({
      id: 'inv-1',
      invoiceNumber: 'INV-2026-000001',
      status: 'DRAFT',
      branchId: 'branch-1',
      totalAmount: 1050,
      paidAmount: 0,
      items: [
        {
          id: 'item-1',
          medicineId: 'med-1',
          quantity: 100,
          batchId: 'batch-1',
          totalPrice: 1000,
        },
      ],
    });

    mockPrisma.$queryRaw.mockResolvedValueOnce([{ currentValue: 1 }]).mockResolvedValueOnce([
      {
        id: 'batch-1',
        batchNumber: 'B1',
        availableQuantity: 10,
        status: 'ACTIVE',
        expiryDate: new Date('2030-01-01'),
      },
    ]);

    await expect(billingService.checkout(tenantId, data, userId)).rejects.toThrow(/stock/i);
  });
});
