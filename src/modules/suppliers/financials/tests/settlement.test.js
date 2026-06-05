import { jest, describe, afterEach, it, expect } from '@jest/globals';

// Define mocks first
const mockPrisma = {
  $transaction: jest.fn((cb) =>
    cb({
      supplierPayment: { create: jest.fn() },
      supplierLedger: { findFirst: jest.fn(), create: jest.fn() },
      purchaseInvoice: { findUnique: jest.fn(), update: jest.fn() },
      supplierPaymentAllocation: { create: jest.fn() },
    }),
  ),
  supplierLedger: { findFirst: jest.fn() },
};

const mockLedgerService = {
  createEntry: jest.fn(),
};

jest.unstable_mockModule('../../../../config/prisma.js', () => ({
  default: mockPrisma,
  __esModule: true,
}));

jest.unstable_mockModule('../ledger/ledger.service.js', () => ({
  default: mockLedgerService,
  __esModule: true,
}));

jest.unstable_mockModule('../../../../shared/events/erp-event-bus.js', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
  erpEventBus: { add: jest.fn(), close: jest.fn() },
}));

jest.unstable_mockModule('../../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../../shared/constants/events.js', () => ({
  DOMAIN_EVENTS: {
    SUPPLIER_INVOICE_RECONCILED: 'supplier.invoice.reconciled',
    SUPPLIER_PAYMENT_MADE: 'supplier.payment.made',
    SUPPLIER_PAYMENT_REVERSED: 'supplier.payment.reversed',
    SUPPLIER_LEDGER_UPDATED: 'supplier.ledger.updated',
  },
  EVENTS: {},
  EVENT_PRIORITY: {},
  EVENT_RETENTION: {},
  PROCUREMENT_STATUS: {},
  BILLING_STATUS: {},
  PRESCRIPTION_STATUS: {},
  PRESCRIPTION_EVENTS: {},
}));

// Dynamic Imports
const { default: settlementService } = await import('../reconciliation/settlement.service.js');
const { default: prisma } = await import('../../../../config/prisma.js');

describe('SettlementService', () => {
  const tenantId = 'test-tenant';
  const userId = 'test-user';
  const supplierId = 'test-supplier';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordPayment', () => {
    it('should correctly allocate payment to multiple invoices', async () => {
      const tx = {
        supplierPayment: { create: jest.fn().mockResolvedValue({ id: 'PAY-1' }) },
        purchaseInvoice: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({ id: 'INV-1', totalAmount: 1000, paidAmount: 0, tenantId })
            .mockResolvedValueOnce({ id: 'INV-2', totalAmount: 2000, paidAmount: 0, tenantId }),
          update: jest.fn(),
        },
        supplierPaymentAllocation: { create: jest.fn() },
      };

      prisma.$transaction.mockImplementation(async (cb) => cb(tx));

      const data = {
        supplierId,
        amount: 1500,
        paymentMethod: 'UPI',
        paymentReference: 'UTR123',
        invoiceIds: ['INV-1', 'INV-2'],
      };

      const result = await settlementService.recordPayment(tenantId, userId, data);

      // Verify first invoice was fully paid (1000)
      expect(tx.purchaseInvoice.update).toHaveBeenCalledWith({
        where: { id: 'INV-1' },
        data: expect.objectContaining({ paidAmount: 1000, paymentStatus: 'PAID' }),
      });

      // Verify second invoice was partially paid (500)
      expect(tx.purchaseInvoice.update).toHaveBeenCalledWith({
        where: { id: 'INV-2' },
        data: expect.objectContaining({ paidAmount: 500, paymentStatus: 'PARTIAL' }),
      });

      expect(result.unallocatedAmount).toBe(0);
    });
  });
});
