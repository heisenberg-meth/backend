import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockLedgerRepository = {
  getLastEntry: jest.fn(),
  createEntry: jest.fn(),
  findHistory: jest.fn(),
};

const mockPaymentRepository = {
  createPayment: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
};

const mockAuditService = {
  log: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/modules/vendors/repositories/ledger.repository.js', () => ({
  default: mockLedgerRepository,
}));

jest.unstable_mockModule('../../src/modules/vendors/repositories/payment.repository.js', () => ({
  default: mockPaymentRepository,
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

const { default: ledgerService } =
  await import('../../src/modules/vendors/services/ledger.service.js');
const { default: paymentService } =
  await import('../../src/modules/vendors/services/payment.service.js');

describe('Vendor Intelligence Unit Tests', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const supplierId = 'supp-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SupplierLedgerService.recordEntry', () => {
    it('should calculate the correct running balance for a purchase', async () => {
      // Previous balance: 100
      mockLedgerRepository.getLastEntry.mockResolvedValue({ balanceAfter: 100 });
      mockLedgerRepository.createEntry.mockImplementation((data) => ({ ...data, id: 'entry-1' }));

      const result = await ledgerService.recordEntry(
        tenantId,
        {
          supplierId,
          type: 'PURCHASE',
          debitAmount: 50,
        },
        mockPrisma,
      );

      // New balance = 100 + 50 (debit) = 150
      expect(result.balanceAfter).toBe(150);
      expect(mockLedgerRepository.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          balanceAfter: 150,
        }),
        mockPrisma,
      );
    });

    it('should calculate the correct running balance for a payment', async () => {
      // Previous balance: 150
      mockLedgerRepository.getLastEntry.mockResolvedValue({ balanceAfter: 150 });
      mockLedgerRepository.createEntry.mockImplementation((data) => ({ ...data, id: 'entry-2' }));

      const result = await ledgerService.recordEntry(
        tenantId,
        {
          supplierId,
          type: 'PAYMENT',
          creditAmount: 50,
        },
        mockPrisma,
      );

      // New balance = 150 - 50 (credit) = 100
      expect(result.balanceAfter).toBe(100);
    });
  });

  describe('SupplierPaymentService.recordPayment', () => {
    it('should record payment and update ledger atomically', async () => {
      const data = {
        supplierId,
        amount: 500,
        paymentMethod: 'UPI',
        paymentDate: '2026-05-13',
      };

      mockPaymentRepository.createPayment.mockResolvedValue({ id: 'pay-1' });
      mockLedgerRepository.getLastEntry.mockResolvedValue({ balanceAfter: 1000 });
      mockLedgerRepository.createEntry.mockResolvedValue({ id: 'entry-3' });

      const result = await paymentService.recordPayment(tenantId, data, userId);

      expect(mockPaymentRepository.createPayment).toHaveBeenCalled();
      // Ledger should be credited (Liability reduced)
      expect(mockLedgerRepository.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PAYMENT',
          creditAmount: 500,
          balanceAfter: 500,
        }),
        mockPrisma,
      );
      expect(result.id).toBe('pay-1');
    });
  });
});
