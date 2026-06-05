import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mockPrisma = {
  invoice: {
    findUnique: jest.fn(),
  },
  invoicePrintJob: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  invoiceDeliveryLog: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule('../../settings/invoice-template/invoice-template.service.js', () => ({
  default: {
    getTemplate: jest.fn().mockResolvedValue({}),
  },
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

jest.unstable_mockModule('../queue/invoice-delivery.queue.js', () => ({
  invoiceDeliveryQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
  invoicePrintQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

jest.unstable_mockModule('../services/pdf-renderer.service.js', () => ({
  default: {
    renderA4: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    renderThermal: jest.fn().mockResolvedValue(Buffer.from('mock-thermal')),
  },
}));

jest.unstable_mockModule('../services/s3-storage.service.js', () => ({
  default: {
    uploadPDF: jest
      .fn()
      .mockResolvedValue({ key: 'invoices/test/original/inv.pdf', url: 's3://bucket/key' }),
    getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
    generatePDFKey: jest.fn().mockReturnValue('invoices/test/original/inv.pdf'),
  },
}));

const { default: billingActionsRoutes } = await import('../routes/billing-actions.routes.js');

const app = express();
app.use(express.json());
app.use('/api/billing', billingActionsRoutes);

describe('Billing Actions API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/billing/invoices/:id/print', () => {
    it('should queue a print job and return 202', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      });

      mockPrisma.invoicePrintJob.create.mockResolvedValue({
        id: 'print-job-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'PENDING',
      });

      const response = await request(app)
        .post('/api/billing/invoices/invoice-1/print')
        .send({ printerType: 'A4', copies: 2 })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.printJobId).toBe('print-job-1');
      expect(response.body.data.status).toBe('PENDING');
    });
  });

  describe('POST /api/billing/invoices/:id/pdf', () => {
    it('should generate PDF and return signed URL', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
        subtotal: 100,
        discountAmount: 10,
        gstAmount: 18,
        cgst: 9,
        sgst: 9,
        igst: 0,
        totalAmount: 108,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        items: [],
        patient: null,
        tenant: { name: 'Test Pharmacy', gstin: '27AAPFU0939F1ZV' },
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        pdfUrl: 'https://signed-url.example.com',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const response = await request(app).post('/api/billing/invoices/invoice-1/pdf').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfUrl).toBe('https://signed-url.example.com');
    });
  });

  describe('POST /api/billing/invoices/:id/whatsapp', () => {
    it('should queue WhatsApp delivery and return 202', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        paymentStatus: 'PAID',
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'QUEUED',
      });

      const response = await request(app)
        .post('/api/billing/invoices/invoice-1/whatsapp')
        .send({ phoneNumber: '+919876543210' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('QUEUED');
      expect(response.body.data.recipient).toBe('+919876543210');
    });
  });

  describe('POST /api/billing/invoices/:id/email', () => {
    it('should queue email delivery and return 202', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        paymentStatus: 'PAID',
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'QUEUED',
      });

      const response = await request(app)
        .post('/api/billing/invoices/invoice-1/email')
        .send({ email: 'patient@example.com' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('QUEUED');
      expect(response.body.data.recipient).toBe('patient@example.com');
    });
  });

  describe('GET /api/billing/invoices/:id/download', () => {
    it('should return existing PDF URL if available', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', tenantId: 'tenant-1' });

      mockPrisma.invoiceDeliveryLog.findFirst.mockResolvedValue({
        id: 'log-1',
        pdfUrl: 'https://existing-signed-url.example.com',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const response = await request(app)
        .get('/api/billing/invoices/invoice-1/download')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfUrl).toBe('https://existing-signed-url.example.com');
    });
  });

  describe('GET /api/billing/invoices/:id/delivery-status', () => {
    it('should return delivery logs and stats', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1', tenantId: 'tenant-1' });

      mockPrisma.invoiceDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          deliveryChannel: 'EMAIL',
          deliveryStatus: 'SENT',
          recipient: 'test@example.com',
          createdAt: new Date(),
        },
        {
          id: 'log-2',
          deliveryChannel: 'WHATSAPP',
          deliveryStatus: 'DELIVERED',
          recipient: '+919876543210',
          createdAt: new Date(),
        },
      ]);

      const response = await request(app)
        .get('/api/billing/invoices/invoice-1/delivery-status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.logs).toHaveLength(2);
    });
  });

  describe('POST /api/billing/invoices/:id/resend', () => {
    it('should queue resend for specified channels', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        tenantId: 'tenant-1',
        invoiceNumber: 'INV-001',
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'QUEUED',
      });

      const response = await request(app)
        .post('/api/billing/invoices/invoice-1/resend')
        .send({
          channels: ['email', 'whatsapp'],
          email: 'patient@example.com',
          phoneNumber: '+919876543210',
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
    });
  });

  describe('POST /api/billing/invoices/bulk-print', () => {
    it('should queue print jobs for multiple invoices', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      });

      mockPrisma.invoicePrintJob.create.mockResolvedValue({
        id: 'print-job-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'PENDING',
      });

      const response = await request(app)
        .post('/api/billing/invoices/bulk-print')
        .send({
          invoiceIds: ['invoice-1', 'invoice-2', 'invoice-3'],
          printerType: 'A4',
          copies: 1,
        })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalQueued).toBe(3);
    });
  });

  describe('POST /api/billing/invoices/:id/regenerate-pdf', () => {
    it('should regenerate PDF and return signed URL', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
      });

      const response = await request(app)
        .post('/api/billing/invoices/invoice-1/regenerate-pdf')
        .send({ reason: 'customer request' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.pdfUrl).toBeDefined();
    });

    it('should return 404 for non-existent invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/billing/invoices/nonexistent/regenerate-pdf')
        .send({ reason: 'lost' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/billing/invoices/:id/print-history', () => {
    it('should return print history for invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1' });
      mockPrisma.invoicePrintJob.findMany.mockResolvedValue([
        {
          id: 'job-1',
          printerType: 'A4',
          copies: 1,
          printStatus: 'PRINTED',
          createdAt: new Date(),
        },
      ]);

      const response = await request(app)
        .get('/api/billing/invoices/invoice-1/print-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.printJobs).toHaveLength(1);
      expect(response.body.data.pagination.total).toBe(1);
    });
  });
});
