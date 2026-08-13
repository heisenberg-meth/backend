import { jest, describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const invoiceTemplatePath = path.resolve(
  __dirname,
  '../../settings/invoice-template/invoice-template.service.js',
);
const authFastifyPath = path.resolve(__dirname, '../../../middleware/auth.fastify.js');
const permissionFastifyPath = path.resolve(__dirname, '../../../middleware/permission.fastify.js');
const invoiceDeliveryQueuePath = path.resolve(__dirname, '../queue/invoice-delivery.queue.js');
const pdfRendererPath = path.resolve(__dirname, '../services/pdf-renderer.service.js');
const s3StoragePath = path.resolve(__dirname, '../services/s3-storage.service.js');
const billingActionsRoutesPath = path.resolve(
  __dirname,
  '../routes/billing-actions.fastify.routes.js',
);

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

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.unstable_mockModule(invoiceTemplatePath, () => ({
  default: {
    getTemplate: jest.fn().mockResolvedValue({}),
  },
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

jest.unstable_mockModule(invoiceDeliveryQueuePath, () => ({
  invoiceDeliveryQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
  invoicePrintQueue: {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

jest.unstable_mockModule(pdfRendererPath, () => ({
  default: {
    renderA4: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
    renderThermal: jest.fn().mockResolvedValue(Buffer.from('mock-thermal')),
  },
}));

jest.unstable_mockModule(s3StoragePath, () => ({
  default: {
    uploadPDF: jest
      .fn()
      .mockResolvedValue({ key: 'invoices/test/original/inv.pdf', url: 's3://bucket/key' }),
    getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
    generatePDFKey: jest.fn().mockReturnValue('invoices/test/original/inv.pdf'),
  },
}));

const { default: billingActionsRoutes } = await import(billingActionsRoutesPath);

describe('Billing Actions API', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(billingActionsRoutes, { prefix: '/api/billing' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/print',
        payload: { printerType: 'A4', copies: 2 },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.printJobId).toBe('print-job-1');
      expect(body.data.status).toBe('PENDING');
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/pdf',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.pdfUrl).toBe('https://signed-url.example.com');
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/whatsapp',
        payload: { phoneNumber: '+919876543210' },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('QUEUED');
      expect(body.data.recipient).toBe('+919876543210');
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/email',
        payload: { email: 'patient@example.com' },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('QUEUED');
      expect(body.data.recipient).toBe('patient@example.com');
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/invoices/invoice-1/download',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.pdfUrl).toBe('https://existing-signed-url.example.com');
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/invoices/invoice-1/delivery-status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.logs).toHaveLength(2);
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/resend',
        payload: {
          channels: ['email', 'whatsapp'],
          email: 'patient@example.com',
          phoneNumber: '+919876543210',
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.results).toHaveLength(2);
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/bulk-print',
        payload: {
          invoiceIds: ['invoice-1', 'invoice-2', 'invoice-3'],
          printerType: 'A4',
          copies: 1,
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.totalQueued).toBe(3);
    });
  });

  describe('POST /api/billing/invoices/:id/regenerate-pdf', () => {
    it('should regenerate PDF and return signed URL', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/regenerate-pdf',
        payload: { reason: 'customer request' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.pdfUrl).toBeDefined();
    });

    it('should return 404 for non-existent invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/nonexistent/regenerate-pdf',
        payload: { reason: 'lost' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/invoices/invoice-1/print-history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.printJobs).toHaveLength(1);
      expect(body.data.pagination.total).toBe(1);
    });
  });
});
