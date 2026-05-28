import { jest , describe, afterEach, it, expect } from '@jest/globals';

// Define Mock Prisma
const mockPrisma = {
  supplier: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  supplierReturn: {
    aggregate: jest.fn(),
  },
  purchaseOrder: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  },
  purchaseOrderItem: {
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  supplierLedger: {
    groupBy: jest.fn(),
  },
  supplierMetrics: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  purchaseInvoice: {
    findMany: jest.fn(),
  },
  medicineSupplier: {
    findMany: jest.fn(),
  },
  goodsReceiptNote: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
  __esModule: true,
}));

// Dynamic Imports
const { default: supplierAnalyticsService } =
  await import('../analytics/supplier-analytics.service.js');
const { default: prisma } = await import('../../../config/prisma.js');

describe('SupplierAnalyticsService', () => {
  const tenantId = 'test-tenant';
  const supplierId = 'test-supplier';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSupplierPerformance', () => {
    it('should calculate supplier risk score correctly', async () => {
      prisma.supplier.findFirst.mockResolvedValue({
        id: supplierId,
        name: 'Test Pharma',
        metrics: {
          totalOrders: 10,
          onTimeDeliveries: 5,
          qualityScore: 60,
          expiryIssuePercentage: 10,
          fulfillmentRate: 90,
          rejectionRate: 2.5,
        },
      });

      prisma.goodsReceiptNote.findMany.mockResolvedValue([
        {
          receivedDate: new Date('2026-05-22'),
          purchaseOrder: {
            approvedAt: new Date('2026-05-17'),
            expectedDeliveryDate: new Date('2026-05-20'),
          },
        },
        {
          receivedDate: new Date('2026-05-22'),
          purchaseOrder: {
            approvedAt: new Date('2026-05-19'),
            expectedDeliveryDate: new Date('2026-05-24'),
          },
        },
      ]);

      const result = await supplierAnalyticsService.getSupplierPerformance(supplierId, tenantId);

      expect(result.onTimeDeliveryRate).toBe(50);
      expect(result.averageLeadTimeDays).toBe(4);
      expect(result.rejectionRate).toBe(2.5);
      expect(result.expiryQualityScore).toBe(60);
      expect(result.overallScore).toBe(3.3);
    });

    it('should return perfect score for new supplier', async () => {
      prisma.supplier.findFirst.mockResolvedValue({
        id: supplierId,
        name: 'New Pharma',
        leadTimeDays: 3,
        metrics: null,
      });

      prisma.goodsReceiptNote.findMany.mockResolvedValue([]);

      const result = await supplierAnalyticsService.getSupplierPerformance(supplierId, tenantId);

      expect(result.onTimeDeliveryRate).toBe(100);
      expect(result.averageLeadTimeDays).toBe(3);
      expect(result.rejectionRate).toBe(0);
      expect(result.expiryQualityScore).toBe(100);
      expect(result.overallScore).toBe(5.0);
    });
  });

  describe('getPendingPayments', () => {
    it('should categorize invoices into aging buckets', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      prisma.purchaseInvoice.findMany.mockResolvedValue([
        {
          id: '1',
          invoiceNumber: 'INV-1',
          totalAmount: 1000,
          dueDate: thirtyDaysAgo,
          paymentStatus: 'PENDING',
        },
        {
          id: '2',
          invoiceNumber: 'INV-2',
          totalAmount: 2000,
          dueDate: fortyFiveDaysAgo,
          paymentStatus: 'PARTIAL',
        },
      ]);

      const result = await supplierAnalyticsService.getPendingPayments(supplierId, tenantId);

      expect(result.pendingAmount).toBe(3000);
      expect(result.agingBuckets['0-30 days']).toBe(1000);
      expect(result.agingBuckets['31-60 days']).toBe(2000);
    });
  });
});
