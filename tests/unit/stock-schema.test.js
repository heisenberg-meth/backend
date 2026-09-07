import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify from 'fastify';

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

jest.unstable_mockModule('../../src/modules/stock/service/stock.service.js', () => ({
  default: {
    stockIn: jest.fn().mockResolvedValue({
      id: 'batch-1',
      tenantId: 'tenant-123',
      branchId: 'branch-123',
      medicineId: 'med-1',
      batchNumber: 'BATCH-001',
      quantity: 100,
      receivedQuantity: 100,
      availableQuantity: 100,
      purchasePrice: 20,
      sellingPrice: 30,
      mrp: 35,
      expiryDate: '2027-01-01T00:00:00.000Z',
      manufacturingDate: '2025-01-01T00:00:00.000Z',
      status: 'ACTIVE',
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    }),
    stockOut: jest.fn().mockResolvedValue({
      totalDeducted: 10,
      batches: [{ batchId: 'batch-1', quantity: 10 }],
    }),
    recordDamage: jest.fn().mockResolvedValue({
      id: 'mov-1',
      tenantId: 'tenant-123',
      medicineId: 'med-1',
      batchId: 'batch-1',
      branchId: 'branch-123',
      movementType: 'DAMAGE',
      quantity: 5,
      quantityBefore: 20,
      quantityAfter: 15,
      performedBy: 'user-123',
      referenceType: 'DAMAGE_LOG',
      referenceId: null,
      notes: 'Broken bottle',
      createdAt: '2026-09-07T00:00:00.000Z',
    }),
    getCurrentStock: jest.fn().mockResolvedValue({
      totalQuantity: 100,
      batches: [
        {
          id: 'batch-1',
          batchNumber: 'BATCH-001',
          quantity: 100,
          availableQuantity: 100,
          expiryDate: '2027-01-01T00:00:00.000Z',
          purchasePrice: 20,
          sellingPrice: 30,
          mrp: 35,
        },
      ],
    }),
  },
}));

jest.unstable_mockModule('../../src/modules/stock/service/ledger.service.js', () => ({
  default: {
    getTransactionHistory: jest.fn().mockResolvedValue({
      transactions: [
        {
          id: 'mov-1',
          tenantId: 'tenant-123',
          medicineId: 'med-1',
          movementType: 'STOCK_IN',
          quantity: 100,
          quantityBefore: 0,
          quantityAfter: 100,
          createdAt: '2026-09-07T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    }),
  },
}));

jest.unstable_mockModule('../../src/modules/stock/service/alert.service.js', () => ({
  default: {
    resolveAlert: jest.fn().mockResolvedValue({ id: 'alert-1', isResolved: true }),
  },
}));

jest.unstable_mockModule('../../src/modules/analytics/service/analytics.service.js', () => ({
  default: {
    getTenantKPIs: jest.fn().mockResolvedValue({ lowStock: 1, expiring30Days: 0 }),
  },
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        medicineId: 'med-1',
        name: 'Paracetamol',
        genericName: 'Acetaminophen',
        currentStock: 2,
        reorderPoint: 10,
      },
    ]),
    inventoryBatch: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

const { default: stockRoutes } =
  await import('../../src/modules/stock/routes/stock.fastify.routes.js');
const { default: movementService } =
  await import('../../src/modules/stock/service/movement.service.js');

describe('Stock API Schemas & Route Validation', () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    await app.register(stockRoutes, { prefix: '/api/stock' });
  });

  describe('POST /api/stock/in schema validation', () => {
    it('rejects payload missing required fields (medicineId, batchNumber, quantity, expiryDate)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/in',
        payload: {
          medicineId: 'med-1',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('required');
    });

    it('rejects payload with quantity less than 1', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/in',
        payload: {
          medicineId: 'med-1',
          batchNumber: 'BATCH-001',
          quantity: 0,
          expiryDate: '2027-01-01',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid payload and returns 201 with created batch', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/in',
        payload: {
          medicineId: 'med-1',
          batchNumber: 'BATCH-001',
          quantity: 100,
          expiryDate: '2027-01-01T00:00:00.000Z',
          purchasePrice: 20,
          sellingPrice: 30,
          mrp: 35,
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.id).toBe('batch-1');
      expect(data.quantity).toBe(100);
      expect(data.batchNumber).toBe('BATCH-001');
    });
  });

  describe('POST /api/stock/out schema validation', () => {
    it('rejects payload missing quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/out',
        payload: {
          medicineId: 'med-1',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects payload with invalid movement type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/out',
        payload: {
          medicineId: 'med-1',
          quantity: 10,
          type: 'INVALID_TYPE',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid stock out payload and returns 200 with deducted quantity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/out',
        payload: {
          medicineId: 'med-1',
          quantity: 10,
          type: 'SALE',
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.totalDeducted).toBe(10);
      expect(data.batches).toHaveLength(1);
    });
  });

  describe('POST /api/stock/damage schema validation', () => {
    it('rejects payload missing batchId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/damage',
        payload: {
          quantity: 5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid damage payload and returns 201 with movement record', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/stock/damage',
        payload: {
          batchId: 'batch-1',
          quantity: 5,
          reason: 'Broken bottle',
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.movementType).toBe('DAMAGE');
      expect(data.quantity).toBe(5);
    });
  });

  describe('GET /api/stock/history schema validation', () => {
    it('accepts valid query parameters and returns 200 with formatted transactions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/stock/history?page=1&limit=20&medicineId=med-1',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.total).toBe(1);
      expect(data.transactions).toHaveLength(1);
      expect(data.transactions[0].movementType).toBe('STOCK_IN');
    });
  });

  describe('GET /api/stock/alerts schema validation', () => {
    it('returns 200 with formatted stock alerts and KPIs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/stock/alerts',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.success).toBe(true);
      expect(data.data.lowStockCount).toBe(1);
      expect(data.data.lowStock[0].name).toBe('Paracetamol');
    });
  });

  describe('PUT /api/stock/alerts/:id/resolve schema validation', () => {
    it('returns 200 message when alert is resolved', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/stock/alerts/alert-123/resolve',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.message).toBe('Alert resolved');
    });
  });

  describe('GET /api/stock/current/:medicineId schema validation', () => {
    it('returns 200 with total quantity and batch list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/stock/current/med-1',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.payload);
      expect(data.totalQuantity).toBe(100);
      expect(data.batches).toHaveLength(1);
    });
  });

  describe('MovementService recordDamage unit tests', () => {
    it('throws error when batch is not found', async () => {
      const fakeTx = {
        inventoryBatch: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      await expect(
        movementService.recordDamage(
          'tenant-123',
          { batchId: 'non-existent', quantity: 5 },
          'user-123',
          fakeTx,
        ),
      ).rejects.toThrow('Batch not found');
    });

    it('throws error when available quantity is insufficient', async () => {
      const fakeTx = {
        inventoryBatch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'b1',
            availableQuantity: 2,
            quantity: 2,
            branchId: 'br1',
            medicineId: 'm1',
          }),
        },
      };

      await expect(
        movementService.recordDamage(
          'tenant-123',
          { batchId: 'b1', quantity: 5 },
          'user-123',
          fakeTx,
        ),
      ).rejects.toThrow('Insufficient stock');
    });
  });
});
