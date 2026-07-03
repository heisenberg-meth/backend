import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockAccountingRepository = {
  upsertGstSummary: jest.fn(),
  findGstSummaries: jest.fn(),
  createExpense: jest.fn(),
  findExpenses: jest.fn(),
};

const mockPrisma = {
  sale: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  purchaseInvoice: {
    findMany: jest.fn(),
  },
  expense: {
    aggregate: jest.fn(),
  },
  saleItem: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../src/modules/finance/repositories/accounting.repository.js', () => ({
  default: mockAccountingRepository,
}));

const { default: gstService } = await import('../../src/modules/finance/services/gst.service.js');
const { default: reconciliationService } =
  await import('../../src/modules/finance/services/reconciliation.service.js');

describe('Accounting Module Unit Tests', () => {
  const tenantId = 'tenant-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GstService.calculateGstBreakdown', () => {
    it('should calculate CGST and SGST for intrastate', () => {
      const result = gstService.calculateGstBreakdown(1000, 18, false);
      expect(result.totalGst).toBe(180);
      expect(result.cgst).toBe(90);
      expect(result.sgst).toBe(90);
      expect(result.igst).toBe(0);
    });

    it('should calculate IGST for interstate', () => {
      const result = gstService.calculateGstBreakdown(1000, 18, true);
      expect(result.totalGst).toBe(180);
      expect(result.cgst).toBe(0);
      expect(result.sgst).toBe(0);
      expect(result.igst).toBe(180);
    });
  });

  describe('GstService.generateMonthlySummary', () => {
    it('should aggregate sales and purchase GST correctly', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([{ gstAmount: 100 }, { gstAmount: 50 }]);
      mockPrisma.purchaseInvoice.findMany.mockResolvedValue([{ gstAmount: 80 }]);

      await gstService.generateMonthlySummary(tenantId, new Date('2026-05-01'));

      expect(mockAccountingRepository.upsertGstSummary).toHaveBeenCalledWith(
        tenantId,
        expect.any(Date),
        expect.objectContaining({
          outputTax: 150,
          inputTaxCredit: 80,
          netGstPayable: 70,
        }),
      );
    });
  });

  describe('ReconciliationService.getProfitLossSummary', () => {
    it('should calculate net profit correctly', async () => {
      mockPrisma.sale.aggregate.mockResolvedValue({ _sum: { subtotal: 5000 } });
      mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });
      mockPrisma.saleItem.findMany.mockResolvedValue([
        { quantity: 10, batch: { purchasePrice: 200 } }, // COGS = 2000
      ]);

      const result = await reconciliationService.getProfitLossSummary(
        tenantId,
        '2026-05-01',
        '2026-05-31',
      );

      expect(result.revenue).toBe(5000);
      expect(result.cogs).toBe(2000);
      expect(result.totalExpenses).toBe(1000);
      expect(result.netProfit).toBe(2000); // 5000 - 2000 - 1000
      expect(result.margin).toBe(40);
    });
  });
});
