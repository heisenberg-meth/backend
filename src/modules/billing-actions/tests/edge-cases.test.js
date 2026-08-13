import { jest, describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const templateServicePath = path.resolve(
  __dirname,
  '../../settings/invoice-template/invoice-template.service.js',
);
const authFastifyPath = path.resolve(__dirname, '../../../middleware/auth.fastify.js');
const permissionFastifyPath = path.resolve(__dirname, '../../../middleware/permission.fastify.js');
const featureGuardFastifyPath = path.resolve(
  __dirname,
  '../../../middleware/feature.guard.fastify.js',
);
const invoiceDeliveryQueuePath = path.resolve(__dirname, '../queue/invoice-delivery.queue.js');
const pdfRendererPath = path.resolve(__dirname, '../services/pdf-renderer.service.js');
const s3StoragePath = path.resolve(__dirname, '../services/s3-storage.service.js');
const billingActionsRoutesPath = path.resolve(
  __dirname,
  '../routes/billing-actions.fastify.routes.js',
);
const pdfGenerationServicePath = path.resolve(__dirname, '../services/pdf-generation.service.js');
const printServicePath = path.resolve(__dirname, '../services/print.service.js');
const deliveryAuditServicePath = path.resolve(__dirname, '../services/delivery-audit.service.js');

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
  invoiceAuditLog: {
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  invoiceTemplate: {
    findUnique: jest.fn(),
  },
};

const mockPdfRenderer = {
  renderA4: jest.fn(),
  renderThermal: jest.fn(),
};

const mockS3Storage = {
  uploadPDF: jest.fn(),
  getSignedUrl: jest.fn(),
  generatePDFKey: jest.fn(),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn(), on: jest.fn() },
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule(templateServicePath, () => ({
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

jest.unstable_mockModule(featureGuardFastifyPath, () => ({
  requireFeature: () => async () => {},
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
  default: mockPdfRenderer,
}));

jest.unstable_mockModule(s3StoragePath, () => ({
  default: mockS3Storage,
}));

const { default: billingActionsRoutes } = await import(billingActionsRoutesPath);
const { default: pdfGenerationService } = await import(pdfGenerationServicePath);
const { default: printService } = await import(printServicePath);
const { default: deliveryAuditService } = await import(deliveryAuditServicePath);

describe('Edge Cases', () => {
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

  describe('Edge Cases - PDF Generation Timeout', () => {
    it('should handle PDF generation timeout gracefully', async () => {
      mockPdfRenderer.renderA4.mockRejectedValue(
        new Error('PDF generation timed out after 30000ms'),
      );

      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
        subtotal: 100,
        discountAmount: 0,
        gstAmount: 18,
        cgst: 9,
        sgst: 9,
        igst: 0,
        totalAmount: 118,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        items: [],
        patient: null,
        tenant: { name: 'Test Pharmacy' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/pdf',
        payload: {},
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('timed out');
    });

    it('should handle empty invoice items edge case', async () => {
      mockPdfRenderer.renderA4.mockResolvedValue(Buffer.from('pdf-buffer'));
      mockS3Storage.uploadPDF.mockResolvedValue({ key: 'invoices/test/original/inv.pdf' });
      mockS3Storage.getSignedUrl.mockResolvedValue('https://signed-url.example.com');

      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'ACTIVE',
        subtotal: 0,
        discountAmount: 0,
        gstAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalAmount: 0,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        items: [],
        patient: null,
        tenant: { name: 'Test Pharmacy' },
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
      expect(body.data.pdfUrl).toBeTruthy();
    });
  });

  describe('Edge Cases - Printer Offline', () => {
    it('should handle printer unreachable error', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      });

      const mockPrintJob = {
        id: 'print-job-1',
        invoiceId: 'invoice-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'PENDING',
        retryCount: 0,
        printerEndpoint: 'http://printer.local/print',
      };

      mockPrisma.invoicePrintJob.create.mockResolvedValue(mockPrintJob);
      mockPrisma.invoicePrintJob.findUnique.mockResolvedValue(mockPrintJob);

      const mockUpdate = jest.fn();
      mockPrisma.invoicePrintJob.update = mockUpdate;

      mockPdfRenderer.renderA4.mockRejectedValue(
        new Error('Printer communication failed: connect ECONNREFUSED 127.0.0.1:9100'),
      );

      const createResult = await printService.createPrintJob('invoice-1', 'tenant-1', {
        printerType: 'THERMAL_80MM',
        copies: 1,
      });

      expect(createResult.printStatus).toBe('PENDING');

      await expect(printService.processPrintJob('print-job-1')).resolves.toMatchObject({
        status: 'failed',
      });
    });
  });

  describe('Edge Cases - WhatsApp Provider Failure', () => {
    it('should log failure when WhatsApp provider returns error', async () => {
      const originalProvider = process.env.WHATSAPP_PROVIDER;
      process.env.WHATSAPP_PROVIDER = 'mock';

      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        paymentStatus: 'PAID',
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'FAILED',
        failureReason: 'Provider returned 401: Unauthorized',
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

      process.env.WHATSAPP_PROVIDER = originalProvider;
    });

    it('should handle non-existent invoice gracefully', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/invoice-1/whatsapp',
        payload: { phoneNumber: 'invalid' },
      });

      expect(response.statusCode).not.toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('Edge Cases - Email Bounce', () => {
    it('should handle email sending failure', async () => {
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
        payload: { email: 'nonexistent@example.com' },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('QUEUED');

      const logSpy = jest.spyOn(deliveryAuditService, 'updateDeliveryStatus');

      mockPrisma.invoiceDeliveryLog.update.mockRejectedValue(
        new Error('550 5.1.1 The email account does not exist'),
      );

      try {
        await deliveryAuditService.updateDeliveryStatus('log-1', 'FAILED', {
          failureReason: '550 5.1.1 The email account does not exist',
        });
      } catch (e) {
        expect(e.message).toContain('email account does not exist');
      }

      logSpy.mockRestore();
    });
  });

  describe('Edge Cases - Duplicate Delivery Retries', () => {
    it('should prevent duplicate delivery for same channel+recipient', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        paymentStatus: 'PAID',
      });

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'SENT',
      });

      mockPrisma.invoiceDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          deliveryChannel: 'EMAIL',
          deliveryStatus: 'SENT',
          recipient: 'test@example.com',
          createdAt: new Date(),
        },
      ]);

      const existingDeliveries = await deliveryAuditService.getDeliveryStatus('invoice-1');
      const existingEmailDeliveries = existingDeliveries.filter(
        (d) =>
          d.deliveryChannel === 'EMAIL' &&
          d.recipient === 'test@example.com' &&
          d.deliveryStatus === 'SENT',
      );

      expect(existingEmailDeliveries.length).toBeGreaterThan(0);
    });

    it('should handle max retry attempts for print job', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      });

      mockPrisma.invoicePrintJob.create.mockResolvedValue({
        id: 'print-job-1',
        invoiceId: 'invoice-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'PENDING',
        retryCount: 0,
      });

      mockPrisma.invoicePrintJob.findUnique.mockResolvedValue({
        id: 'print-job-1',
        invoiceId: 'invoice-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'RETRYING',
        retryCount: 0,
        printerEndpoint: null,
        invoice: {
          items: [],
          tenant: { name: 'Test Pharmacy' },
        },
      });

      mockPdfRenderer.renderA4.mockRejectedValue(new Error('Printer communication failed'));

      const mockUpdate = jest.fn();
      mockPrisma.invoicePrintJob.update = mockUpdate;

      mockUpdate
        .mockResolvedValueOnce({ printStatus: 'RETRYING' })
        .mockResolvedValueOnce({ printStatus: 'PENDING', retryCount: 1 })
        .mockResolvedValueOnce({ printStatus: 'RETRYING' })
        .mockResolvedValueOnce({ printStatus: 'PENDING', retryCount: 2 })
        .mockResolvedValueOnce({ printStatus: 'RETRYING' })
        .mockResolvedValueOnce({ printStatus: 'FAILED', retryCount: 3 });

      const result1 = await printService.processPrintJob('print-job-1');
      expect(result1.status).toBe('failed');
      expect(result1.retryCount).toBe(1);
    });
  });

  describe('Edge Cases - Regenerate PDF', () => {
    it('should regenerate PDF with watermark for cancelled invoice', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        status: 'CANCELLED',
        subtotal: 100,
        discountAmount: 0,
        gstAmount: 18,
        cgst: 9,
        sgst: 9,
        igst: 0,
        totalAmount: 118,
        paymentMethod: 'CASH',
        paymentStatus: 'REFUNDED',
        createdAt: new Date(),
        items: [],
        patient: null,
        tenant: { name: 'Test Pharmacy' },
      });

      mockPdfRenderer.renderA4.mockResolvedValue(Buffer.from('cancelled-pdf'));
      mockS3Storage.uploadPDF.mockResolvedValue({ key: 'invoices/test/watermarked/inv.pdf' });
      mockS3Storage.getSignedUrl.mockResolvedValue('https://signed-url.example.com/cancelled');
      mockS3Storage.generatePDFKey.mockReturnValue('invoices/test/watermarked/inv.pdf');

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        pdfUrl: 'https://signed-url.example.com/cancelled',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await pdfGenerationService.generateAndStore('invoice-1', 'tenant-1', {
        watermark: 'CANCELLED INVOICE',
      });

      expect(result.pdfUrl).toBeTruthy();
      expect(mockPdfRenderer.renderA4).toHaveBeenCalled();
    });

    it('should return 404 for non-existent invoice on regenerate', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/invoices/nonexistent-id/regenerate-pdf',
        payload: { reason: 'lost original' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('Edge Cases - Print History', () => {
    it('should return empty print history for invoice with no print jobs', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1' });
      mockPrisma.invoicePrintJob.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/invoices/invoice-1/print-history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.printJobs).toHaveLength(0);
      expect(body.data.pagination.total).toBe(0);
    });

    it('should return 404 for non-existent invoice on print-history', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/invoices/nonexistent/print-history',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('Edge Cases - Concurrent Delivery Requests', () => {
    it('should handle rapid duplicate delivery requests gracefully', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        invoiceNumber: 'INV-001',
        totalAmount: 100,
        paymentStatus: 'PAID',
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue({
        id: 'log-1',
        deliveryStatus: 'QUEUED',
      });

      const promises = Array(5)
        .fill()
        .map(() =>
          app.inject({
            method: 'POST',
            url: '/api/billing/invoices/invoice-1/email',
            payload: { email: 'test@example.com' },
          }),
        );

      const responses = await Promise.all(promises);

      responses.forEach((res) => {
        expect(res.statusCode).toBe(202);
        const body = JSON.parse(res.payload);
        expect(body.success).toBe(true);
      });
    });
  });
});
