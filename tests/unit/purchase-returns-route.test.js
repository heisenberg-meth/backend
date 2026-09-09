import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

const mockSupplierReturnService = {
  getReturns: jest.fn(),
  processReturn: jest.fn(),
};

jest.unstable_mockModule('../../src/middleware/auth.fastify.js', () => ({
  authenticate: async (req) => {
    req.user = { id: 'user-123', role: 'ADMIN' };
    req.tenantId = 'tenant-123';
    req.branchId = 'branch-123';
  },
  requireTenant: async (req) => {
    req.tenantId = req.tenantId || 'tenant-123';
  },
}));

jest.unstable_mockModule('../../src/middleware/permission.fastify.js', () => ({
  requirePermission: () => async () => {},
}));

jest.unstable_mockModule('../../src/middleware/feature.guard.fastify.js', () => ({
  requireFeature: () => async () => {},
}));

jest.unstable_mockModule(
  '../../src/modules/purchase/services/supplier-return.service.js',
  () => ({
    default: mockSupplierReturnService,
  }),
);

const { default: purchaseRoutes } = await import(
  '../../src/modules/purchase/routes/purchase.fastify.routes.js'
);

describe('Purchase Returns API - GET & POST /api/purchase/returns', () => {
  let app;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = Fastify();
    await app.register(purchaseRoutes, { prefix: '/api/purchase' });
  });

  describe('GET /api/purchase/returns', () => {
    it('should return 200 with list of purchase returns and pagination', async () => {
      const mockReturnsData = [
        {
          id: 'ret-e10c0e9b-6ef9-4089-9aa8-2adcf32490b1',
          tenantId: 'tenant-123',
          supplierId: 'supp-4f065283-18a9-41d3-95c9-49be4f5024da',
          returnNumber: 'RET-2026-00001',
          returnAmount: '250.00',
          status: 'APPROVED',
          reason: 'DAMAGED',
          createdAt: '2026-09-09T10:00:00.000Z',
          supplier: {
            id: 'supp-4f065283-18a9-41d3-95c9-49be4f5024da',
            name: 'Apex Healthcare Pvt Ltd',
            phone: '+91 9876543210',
          },
          items: [
            {
              id: 'item-8f92120e-c288-4f93-b6d3-2475e2db890a',
              returnId: 'ret-e10c0e9b-6ef9-4089-9aa8-2adcf32490b1',
              medicineId: 'med-101',
              batchId: 'batch-202',
              quantity: 10,
              purchasePrice: '25.00',
              medicine: {
                id: 'med-101',
                name: 'Paracetamol 500mg',
              },
              batch: {
                id: 'batch-202',
                batchNumber: 'BATCH-2026-A',
                expiryDate: '2027-06-30T00:00:00.000Z',
                medicine: {
                  id: 'med-101',
                  name: 'Paracetamol 500mg',
                },
              },
            },
          ],
        },
      ];

      const mockPagination = {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      };

      mockSupplierReturnService.getReturns.mockResolvedValue({
        returns: mockReturnsData,
        pagination: mockPagination,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/purchase/returns?page=1&limit=20',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      console.log('GET /api/purchase/returns Response:', JSON.stringify(body, null, 2));

      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].returnNumber).toBe('RET-2026-00001');
      expect(body.data[0].items).toHaveLength(1);
      expect(body.data[0].supplier.name).toBe('Apex Healthcare Pvt Ltd');
      expect(body.pagination).toEqual(mockPagination);
      expect(mockSupplierReturnService.getReturns).toHaveBeenCalledWith('tenant-123', 1, 20);
    });

    it('should return 200 with empty data array when no returns exist', async () => {
      mockSupplierReturnService.getReturns.mockResolvedValue({
        returns: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/purchase/returns',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('POST /api/purchase/returns', () => {
    it('should process a return and return 201 with returnId', async () => {
      const payload = {
        supplierId: 'supp-4f065283-18a9-41d3-95c9-49be4f5024da',
        purchaseInvoiceId: 'inv-1234',
        reason: 'DAMAGED',
        items: [
          {
            batchId: 'batch-202',
            quantity: 5,
          },
        ],
      };

      mockSupplierReturnService.processReturn.mockResolvedValue({
        id: 'ret-new-uuid',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/purchase/returns',
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      console.log('POST /api/purchase/returns Response:', JSON.stringify(body, null, 2));

      expect(body.success).toBe(true);
      expect(body.returnId).toBe('ret-new-uuid');
      expect(body.message).toBe('Return processed successfully');
    });

    it('should reject request missing batchId or quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/purchase/returns',
        payload: {
          supplierId: 'supp-1',
          items: [{ quantity: 0 }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.message).toContain('Batch ID is required');
    });
  });
});
