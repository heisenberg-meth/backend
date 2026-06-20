import { jest, describe, beforeEach, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const returnRepoPath = path.resolve(__dirname, '../repositories/return.repository.js');
const creditNoteRepoPath = path.resolve(__dirname, '../repositories/credit-note.repository.js');
const refundOrchestratorPath = path.resolve(
  __dirname,
  '../../refunds/services/unified-refund.orchestrator.js',
);

// Fastify middlewares
const authFastifyPath = path.resolve(__dirname, '../../../middleware/auth.fastify.js');
const permissionFastifyPath = path.resolve(__dirname, '../../../middleware/permission.fastify.js');
const featureGuardFastifyPath = path.resolve(
  __dirname,
  '../../../middleware/feature.guard.fastify.js',
);

// Valid UUID Constants for validation matching
const invoiceId = 'e2d1d072-6893-41a4-966e-c906660b5ff1';
const invoiceItemId = 'b9ef96a0-4ff6-4277-8fa7-7a5444a7f05b';
const returnId = 'c6f376f9-03c6-43b6-9811-37f26d36e2f1';
const creditNoteId = '85e05a8d-b0a3-4a1e-8789-21b333796d19';
const medicineId = 'fa7d10e0-bb1a-4f51-b0e7-0130dbfaee51';
const batchId = '1d8494b2-031e-450e-b7d6-848e3a24b13a';

const mockPrisma = {
  invoice: {
    findUnique: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  return: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  creditNote: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  returnItem: {
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  gstSummary: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  hsnSummary: {
    upsert: jest.fn(),
  },
  inventoryBatch: {
    update: jest.fn(),
  },
  stockTransaction: {
    create: jest.fn(),
  },
  inventoryTransaction: {
    create: jest.fn(),
  },
  damagedStock: {
    create: jest.fn(),
  },
  salesAnomaly: {
    create: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
};

const mockReturnRepository = {
  createReturn: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  updateStatus: jest.fn(),
  findByInvoiceId: jest.fn().mockResolvedValue([]),
  getReturnStats: jest.fn(),
  generateReturnNumber: jest.fn().mockResolvedValue('RET-GEN-2026-000001'),
};

const mockCreditNoteRepository = {
  createCreditNote: jest.fn(),
  findById: jest.fn(),
  findByReturnId: jest.fn().mockResolvedValue([]),
  updateStatus: jest.fn(),
  generateCreditNoteNumber: jest.fn().mockResolvedValue('CN-GEN-2026-000001'),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockRefundOrchestrator = {
  processRefund: jest.fn(),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(returnRepoPath, () => ({
  default: mockReturnRepository,
}));

jest.unstable_mockModule(creditNoteRepoPath, () => ({
  default: mockCreditNoteRepository,
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: {
    emit: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

jest.unstable_mockModule(authFastifyPath, () => ({
  authenticate: async (request) => {
    request.user = { id: 'user-1', role: 'ADMIN' };
  },
  requireTenant: async (request) => {
    request.tenantId = 'tenant-1';
  },
}));

jest.unstable_mockModule(permissionFastifyPath, () => ({
  requirePermission: () => async () => {},
}));

jest.unstable_mockModule(featureGuardFastifyPath, () => ({
  requireFeature: () => async () => {},
}));

jest.unstable_mockModule(refundOrchestratorPath, () => ({
  default: mockRefundOrchestrator,
}));

const { default: returnsRoutes } = await import('../routes/returns.fastify.routes.js');

describe('Returns API Integration', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(returnsRoutes, { prefix: '/api/billing' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/billing/returns', () => {
    it('should create a return and return 201', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
        totalAmount: 1000,
        createdAt: new Date(),
        items: [
          {
            id: invoiceItemId,
            medicineId,
            batchId,
            quantity: 10,
            unitPrice: 100,
            gstPercentage: 12,
            medicine: { name: 'Paracetamol' },
            batch: { batchNumber: 'B001' },
          },
        ],
        patient: { fullName: 'Test Patient', phone: '+919876543210' },
        branch: { code: 'CHN' },
      });

      mockReturnRepository.createReturn.mockResolvedValue({
        id: returnId,
        returnNumber: 'RET-GEN-2026-000001',
        status: 'REQUESTED',
        totalReturnAmount: 200,
        approvalRequired: false,
        items: [],
        invoice: { invoiceNumber: 'INV-001' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/returns',
        payload: {
          invoiceId,
          reason: 'CUSTOMER_RETURN',
          items: [{ invoiceItemId, quantity: 2 }],
          refundMethod: 'UPI',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.return.returnNumber).toBe('RET-GEN-2026-000001');
    });

    it('should reject return for cancelled invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        status: 'CANCELLED',
        createdAt: new Date(),
        items: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/returns',
        payload: {
          invoiceId,
          reason: 'CUSTOMER_RETURN',
          items: [{ invoiceItemId, quantity: 2 }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('cancelled');
    });
  });

  describe('GET /api/billing/returns', () => {
    it('should return list of returns', async () => {
      mockReturnRepository.findAll.mockResolvedValue({
        returns: [
          {
            id: returnId,
            returnNumber: 'RET-GEN-2026-000001',
            status: 'APPROVED',
            totalReturnAmount: 500,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/returns',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('should support status filter', async () => {
      mockReturnRepository.findAll.mockResolvedValue({
        returns: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/returns',
        query: { status: 'APPROVED' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/billing/returns/:id', () => {
    it('should return return with credit notes', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: returnId,
        returnNumber: 'RET-GEN-2026-000001',
        status: 'APPROVED',
        items: [],
        invoice: { items: [], patient: {} },
        creditNotes: [
          { id: creditNoteId, creditNoteNumber: 'CN-GEN-2026-000001', totalCreditAmount: 500 },
        ],
      });

      mockReturnRepository.generateReturnNumber.mockResolvedValue('RET-GEN-2026-000001');

      const response = await app.inject({
        method: 'GET',
        url: `/api/billing/returns/${returnId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.return.returnNumber).toBe('RET-GEN-2026-000001');
      expect(body.data.creditNotes).toHaveLength(1);
    });

    it('should return 404 for non-existent return', async () => {
      mockReturnRepository.findById.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: `/api/billing/returns/${returnId}`,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/billing/returns/:id/approve', () => {
    it('should approve a return', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: returnId,
        status: 'UNDER_REVIEW',
        items: [],
        invoice: {},
      });

      mockReturnRepository.updateStatus.mockResolvedValue({
        id: returnId,
        status: 'APPROVED',
        approvedBy: 'user-1',
        approvedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/billing/returns/${returnId}/approve`,
        payload: { notes: 'Approved by manager' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('APPROVED');
    });
  });

  describe('POST /api/billing/returns/:id/reject', () => {
    it('should reject a return', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: returnId,
        status: 'REQUESTED',
        items: [],
        invoice: {},
      });

      mockReturnRepository.updateStatus.mockResolvedValue({
        id: returnId,
        status: 'REJECTED',
        rejectionReason: 'Invalid reason',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/billing/returns/${returnId}/reject`,
        payload: { reason: 'Invalid reason' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('REJECTED');
    });
  });

  describe('POST /api/billing/returns/:id/credit-note', () => {
    it('should generate a credit note', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: returnId,
        status: 'APPROVED',
        invoiceId: invoiceId,
        items: [
          {
            id: 'item-1',
            returnAmount: 200,
            gstAdjustment: 24,
          },
        ],
        invoice: { branch: { code: 'CHN' }, igst: 0 },
      });

      mockCreditNoteRepository.createCreditNote.mockResolvedValue({
        id: creditNoteId,
        creditNoteNumber: 'CN-GEN-2026-000001',
        totalCreditAmount: 200,
        gstAdjustment: 24,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/billing/returns/${returnId}/credit-note`,
        payload: { notes: 'Credit note for return' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.creditNoteNumber).toBe('CN-GEN-2026-000001');
    });
  });

  describe('POST /api/billing/returns/:id/refund', () => {
    it('should process a refund', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: returnId,
        status: 'APPROVED',
        tenantId: 'tenant-1',
        invoiceId: invoiceId,
        totalReturnAmount: 500,
        refundStatus: 'PENDING',
        items: [],
        invoice: { totalAmount: 1000, payments: [] },
      });

      mockRefundOrchestrator.processRefund.mockResolvedValue({
        returnRecord: {
          id: returnId,
          status: 'REFUNDED',
          refundStatus: 'COMPLETED',
          refundMethod: 'UPI',
        },
      });

      mockPrisma.return.update.mockResolvedValue({
        id: returnId,
        status: 'REFUNDED',
        refundStatus: 'COMPLETED',
        refundMethod: 'UPI',
      });

      mockPrisma.return.aggregate.mockResolvedValue({
        _sum: { totalReturnAmount: 500 },
      });

      mockPrisma.invoice.update.mockResolvedValue({
        id: invoiceId,
        status: 'PARTIALLY_REFUNDED',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/billing/returns/${returnId}/refund`,
        payload: { refundMethod: 'UPI', transactionId: 'TXN-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });
});
