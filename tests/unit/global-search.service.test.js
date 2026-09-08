import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  medicine: {
    findMany: jest.fn(),
  },
  supplier: {
    findMany: jest.fn(),
  },
  invoice: {
    findMany: jest.fn(),
  },
  prescription: {
    findMany: jest.fn(),
  },
  patient: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

const {
  default: globalSearchService,
  STATIC_ANALYTICS,
  STATIC_SETTINGS,
} = await import('../../src/modules/global-search/services/global-search.service.js');

describe('GlobalSearchService Unit Tests', () => {
  const tenantId = 'tenant-test-123';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Static search', () => {
    it('should return analytics static items matching query', () => {
      const results = globalSearchService.searchStatic(STATIC_ANALYTICS, 'sales');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('Analytics');
      expect(results[0].path).toBe('/analytics');
    });

    it('should return settings static items matching query', () => {
      const results = globalSearchService.searchStatic(STATIC_SETTINGS, 'team');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('Settings');
      expect(results[0].path).toBe('/team');
    });

    it('should return empty array if query is empty for general categories', async () => {
      const results = await globalSearchService.searchGlobal(tenantId, { q: '', category: 'All' });
      expect(results).toEqual([]);
    });

    it('should return static list when category is Analytics and query is empty', async () => {
      const results = await globalSearchService.searchGlobal(tenantId, {
        q: '',
        category: 'Analytics',
      });
      expect(results.length).toBe(STATIC_ANALYTICS.length);
    });
  });

  describe('Database search integration', () => {
    it('should search medicines and format results with stock count', async () => {
      mockPrisma.medicine.findMany.mockResolvedValueOnce([
        {
          id: 'med-1',
          name: 'Paracetamol 500mg',
          genericName: 'Paracetamol',
          brandName: 'Dolo',
          dosageForm: 'Tablet',
          strength: '500mg',
          inventoryBatches: [{ quantity: 50 }, { quantity: 70 }],
        },
      ]);

      const results = await globalSearchService.searchMedicines(tenantId, 'paracetamol', 10);
      expect(mockPrisma.medicine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            deletedAt: null,
          }),
        }),
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'med_med-1',
        type: 'Medicines',
        title: 'Paracetamol 500mg',
        subtitle: 'Tablet · 500mg · 120 units in stock',
        meta: 'Generic: Paracetamol',
        path: '/inventory',
        entityId: 'med-1',
      });
    });

    it('should search suppliers and return normalized results', async () => {
      mockPrisma.supplier.findMany.mockResolvedValueOnce([
        {
          id: 'sup-1',
          name: 'Apex Pharma Distributors',
          contactPerson: 'Rajesh Kumar',
          phone: '9876543210',
          email: 'rajesh@apex.com',
          gstNumber: '29ABCDE1234F1Z5',
          supplierType: 'WHOLESALER',
        },
      ]);

      const results = await globalSearchService.searchSuppliers(tenantId, 'apex', 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'sup_sup-1',
        type: 'Suppliers',
        title: 'Apex Pharma Distributors',
        subtitle: 'Rajesh Kumar · 9876543210',
        meta: 'GST: 29ABCDE1234F1Z5',
        path: '/suppliers',
        entityId: 'sup-1',
      });
    });

    it('should search invoices and return formatted currency subtitle', async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-0089',
          customerName: 'Suresh Patil',
          totalAmount: 1540.5,
          paymentStatus: 'PAID',
          status: 'COMPLETED',
        },
      ]);

      const results = await globalSearchService.searchInvoices(tenantId, 'INV-2026', 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'inv_inv-1',
        type: 'Invoices',
        title: 'INV-2026-0089',
        subtitle: 'Suresh Patil · ₹1,540.5',
        meta: 'PAID · COMPLETED',
        path: '/billing',
        entityId: 'inv-1',
      });
    });

    it('should combine results across categories when category is All', async () => {
      mockPrisma.medicine.findMany.mockResolvedValueOnce([
        {
          id: 'med-1',
          name: 'Aspirin',
          genericName: 'Acetylsalicylic acid',
          inventoryBatches: [],
        },
      ]);
      mockPrisma.supplier.findMany.mockResolvedValueOnce([]);
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);
      mockPrisma.prescription.findMany.mockResolvedValueOnce([]);

      const results = await globalSearchService.searchGlobal(tenantId, {
        q: 'aspirin',
        category: 'All',
        limit: 20,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].type).toBe('Medicines');
      expect(results[0].title).toBe('Aspirin');
    });
  });
});
