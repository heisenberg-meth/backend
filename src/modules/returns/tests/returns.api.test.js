import { jest , describe, beforeEach, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const returnRepoPath = path.resolve(__dirname, '../repositories/return.repository.js');
const creditNoteRepoPath = path.resolve(__dirname, '../repositories/credit-note.repository.js');

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

jest.unstable_mockModule('../../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.user = { id: 'user-1', role: 'ADMIN' };
    req.tenantId = 'tenant-1';
    next();
  },
}));

jest.unstable_mockModule('../../../middleware/role.middleware.js', () => ({
  authorize: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../../middleware/validate.middleware.js', () => ({
  default: () => (req, res, next) => next(),
}));

const { default: returnsRoutes } = await import('../routes/returns.routes.js');

const app = express();
app.use(express.json());
app.use('/api/billing', returnsRoutes);

describe('Returns API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/billing/returns', () => {
    it('should create a return and return 201', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
        totalAmount: 1000,
        createdAt: new Date(),
        items: [
          {
            id: 'item-1',
            medicineId: 'med-1',
            batchId: 'batch-1',
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
        id: 'return-1',
        returnNumber: 'RET-GEN-2026-000001',
        status: 'REQUESTED',
        totalReturnAmount: 200,
        approvalRequired: false,
        items: [],
        invoice: { invoiceNumber: 'INV-001' },
      });

      const response = await request(app)
        .post('/api/billing/returns')
        .send({
          invoiceId: 'invoice-1',
          reason: 'CUSTOMER_RETURN',
          items: [{ invoiceItemId: 'item-1', quantity: 2 }],
          refundMethod: 'UPI',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.return.returnNumber).toBe('RET-GEN-2026-000001');
    });

    it('should reject return for cancelled invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        status: 'CANCELLED',
        createdAt: new Date(),
        items: [],
      });

      const response = await request(app)
        .post('/api/billing/returns')
        .send({
          invoiceId: 'invoice-1',
          reason: 'CUSTOMER_RETURN',
          items: [{ invoiceItemId: 'item-1', quantity: 2 }],
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cancelled');
    });
  });

  describe('GET /api/billing/returns', () => {
    it('should return list of returns', async () => {
      mockReturnRepository.findAll.mockResolvedValue({
        returns: [
          {
            id: 'return-1',
            returnNumber: 'RET-GEN-2026-000001',
            status: 'APPROVED',
            totalReturnAmount: 500,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const response = await request(app)
        .get('/api/billing/returns')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should support status filter', async () => {
      mockReturnRepository.findAll.mockResolvedValue({
        returns: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });

      const response = await request(app)
        .get('/api/billing/returns?status=APPROVED')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/billing/returns/:id', () => {
    it('should return return with credit notes', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: 'return-1',
        returnNumber: 'RET-GEN-2026-000001',
        status: 'APPROVED',
        items: [],
        invoice: { items: [], patient: {} },
        creditNotes: [
          { id: 'cn-1', creditNoteNumber: 'CN-GEN-2026-000001', totalCreditAmount: 500 },
        ],
      });

      const response = await request(app)
        .get('/api/billing/returns/return-1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.return.returnNumber).toBe('RET-GEN-2026-000001');
      expect(response.body.data.creditNotes).toHaveLength(1);
    });

    it('should return 404 for non-existent return', async () => {
      mockReturnRepository.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/billing/returns/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/billing/returns/:id/approve', () => {
    it('should approve a return', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: 'return-1',
        status: 'UNDER_REVIEW',
        items: [],
        invoice: {},
      });

      mockReturnRepository.updateStatus.mockResolvedValue({
        id: 'return-1',
        status: 'APPROVED',
        approvedBy: 'user-1',
        approvedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/billing/returns/return-1/approve')
        .send({ notes: 'Approved by manager' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('APPROVED');
    });
  });

  describe('POST /api/billing/returns/:id/reject', () => {
    it('should reject a return', async () => {
      mockReturnRepository.findById.mockResolvedValue({
        id: 'return-1',
        status: 'REQUESTED',
        items: [],
        invoice: {},
      });

      mockReturnRepository.updateStatus.mockResolvedValue({
        id: 'return-1',
        status: 'REJECTED',
        rejectionReason: 'Invalid reason',
      });

      const response = await request(app)
        .post('/api/billing/returns/return-1/reject')
        .send({ reason: 'Invalid reason' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('REJECTED');
    });
  });

  describe('POST /api/billing/returns/:id/credit-note', () => {
    it('should generate a credit note', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: 'return-1',
        status: 'APPROVED',
        invoiceId: 'invoice-1',
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
        id: 'cn-1',
        creditNoteNumber: 'CN-GEN-2026-000001',
        totalCreditAmount: 200,
        gstAdjustment: 24,
      });

      const response = await request(app)
        .post('/api/billing/returns/return-1/credit-note')
        .send({ notes: 'Credit note for return' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.creditNoteNumber).toBe('CN-GEN-2026-000001');
    });
  });

  describe('POST /api/billing/returns/:id/refund', () => {
    it('should process a refund', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: 'return-1',
        status: 'APPROVED',
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        totalReturnAmount: 500,
        refundStatus: 'PENDING',
        items: [],
        invoice: { totalAmount: 1000, payments: [] },
      });

      mockPrisma.return.update.mockResolvedValue({
        id: 'return-1',
        status: 'REFUNDED',
        refundStatus: 'COMPLETED',
        refundMethod: 'UPI',
      });

      mockPrisma.return.aggregate.mockResolvedValue({
        _sum: { totalReturnAmount: 500 },
      });

      mockPrisma.invoice.update.mockResolvedValue({ id: 'invoice-1', status: 'PARTIALLY_REFUNDED' });

      const response = await request(app)
        .post('/api/billing/returns/return-1/refund')
        .send({ refundMethod: 'UPI', transactionId: 'TXN-123' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});
