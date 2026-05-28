import { jest , describe, afterEach , it, expect } from '@jest/globals';

// Mocks
const mockSalesRepository = {
  createSale: jest.fn(),
  findById: jest.fn(),
};

const mockSummaryRepository = {
  upsertDailySummary: jest.fn(),
};

const mockSalesReturnRepository = {
  createReturn: jest.fn(),
};

const mockMovementService = {
  stockIn: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
  sale: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  saleItem: {
    findUnique: jest.fn(),
  },
  inventoryBatch: {
    update: jest.fn(),
  }
};

const mockAuditService = {
  log: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

jest.unstable_mockModule('../../src/modules/sales/repositories/sales.repository.js', () => ({
  default: mockSalesRepository
}));

jest.unstable_mockModule('../../src/modules/sales/repositories/summary.repository.js', () => ({
  default: mockSummaryRepository
}));

jest.unstable_mockModule('../../src/modules/sales/repositories/sales_return.repository.js', () => ({
  default: mockSalesReturnRepository
}));

jest.unstable_mockModule('../../src/modules/stock/service/movement.service.js', () => ({
  default: mockMovementService
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService
}));

const { default: returnsService } =
  await import('../../src/modules/sales/services/returns.service.js');
const { default: analyticsService } =
  await import('../../src/modules/sales/services/analytics.service.js');

describe('Sales Module Unit Tests', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ReturnsService.processReturn', () => {
    it('should process a return and restock inventory', async () => {
      const data = {
        saleItemId: 'si-1',
        quantity: 2,
        reason: 'Wrong Item',
        condition: 'sealed'
      };

      mockPrisma.saleItem.findUnique.mockResolvedValue({
        id: 'si-1',
        saleId: 's-1',
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 10,
        totalAmount: 100,
        unitPrice: 10,
        returns: [],
        sale: { tenantId, totalItems: 10 },
        medicine: { name: 'Dolo' }
      });

      mockSalesReturnRepository.createReturn.mockResolvedValue({ id: 'ret-1' });
      mockMovementService.stockIn.mockResolvedValue({});
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockPrisma.sale.update.mockResolvedValue({});

      const result = await returnsService.processReturn(tenantId, data, userId);

      expect(mockSalesReturnRepository.createReturn).toHaveBeenCalledWith(expect.objectContaining({
        refundAmount: 20 // (100 / 10) * 2
      }), mockPrisma);
      expect(mockMovementService.stockIn).toHaveBeenCalled();
      expect(result.id).toBe('ret-1');
    });

    it('should fail if return quantity exceeds sold', async () => {
      const data = { saleItemId: 'si-1', quantity: 100 };

      mockPrisma.saleItem.findUnique.mockResolvedValue({
        id: 'si-1',
        quantity: 10,
        returns: [],
        sale: { tenantId }
      });

      await expect(returnsService.processReturn(tenantId, data, userId))
        .rejects.toThrow('Cannot return more than sold');
    });
  });

  describe('AnalyticsService.generateDailySummary', () => {
    it('should aggregate sales totals correctly', async () => {
      const mockSales = [
        {
          totalAmount: 100,
          totalItems: 2,
          discountAmount: 10,
          gstAmount: 10,
          paymentMethod: 'CASH',
        },
        {
          totalAmount: 200,
          totalItems: 4,
          discountAmount: 20,
          gstAmount: 20,
          paymentMethod: 'UPI',
        },
      ];

      mockPrisma.sale.findMany.mockResolvedValue(mockSales);
      mockSummaryRepository.upsertDailySummary.mockResolvedValue({ id: 'sum-1' });

      await analyticsService.generateDailySummary(tenantId, new Date());

      expect(mockSummaryRepository.upsertDailySummary).toHaveBeenCalledWith(
        expect.objectContaining({
          totalSales: 300,
          totalInvoices: 2,
          cashSales: 100,
          upiSales: 200,
        }),
      );
    });
  });
});
