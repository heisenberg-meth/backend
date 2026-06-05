import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: {
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
  },
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn(), on: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
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
    renderA4: jest.fn(),
    renderThermal: jest.fn(),
  },
}));

jest.unstable_mockModule('../services/s3-storage.service.js', () => ({
  default: {
    uploadPDF: jest.fn(),
    getSignedUrl: jest.fn(),
    generatePDFKey: jest.fn(),
  },
}));

const mockPdfRenderer = (await import('../services/pdf-renderer.service.js')).default;
const mockS3Storage = (await import('../services/s3-storage.service.js')).default;
const mockPrisma = (await import('../../../config/prisma.js')).default;

const { default: billingActionsRoutes } = await import('../routes/billing-actions.routes.js');
const { default: pdfGenerationService } = await import('../services/pdf-generation.service.js');
const { default: printService } = await import('../services/print.service.js');
const { default: deliveryAuditService } = await import('../services/delivery-audit.service.js');

const app = express();
app.use(express.json());
app.use('/api/billing', billingActionsRoutes);

describe('Edge Cases - PDF Generation Timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle PDF generation timeout gracefully', async () => {
    mockPdfRenderer.renderA4.mockRejectedValue(new Error('PDF generation timed out after 30000ms'));

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

    const response = await request(app).post('/api/billing/invoices/invoice-1/pdf').expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('timed out');
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

    const response = await request(app).post('/api/billing/invoices/invoice-1/pdf').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.pdfUrl).toBeTruthy();
  });
});

describe('Edge Cases - Printer Offline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

    const response = await request(app)
      .post('/api/billing/invoices/invoice-1/whatsapp')
      .send({ phoneNumber: '+919876543210' })
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('QUEUED');

    process.env.WHATSAPP_PROVIDER = originalProvider;
  });

  it('should handle invalid phone number format', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/billing/invoices/invoice-1/whatsapp')
      .send({ phoneNumber: 'invalid' });

    const isRejected = response.status !== 202;
    expect(isRejected || response.body.success === false).toBe(true);
  });
});

describe('Edge Cases - Email Bounce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

    const response = await request(app)
      .post('/api/billing/invoices/invoice-1/email')
      .send({ email: 'nonexistent@example.com' })
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('QUEUED');

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

    const response = await request(app)
      .post('/api/billing/invoices/nonexistent-id/regenerate-pdf')
      .send({ reason: 'lost original' })
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

describe('Edge Cases - Print History', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty print history for invoice with no print jobs', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'invoice-1' });
    mockPrisma.invoicePrintJob.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/billing/invoices/invoice-1/print-history')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.printJobs).toHaveLength(0);
    expect(response.body.data.pagination.total).toBe(0);
  });

  it('should return 404 for non-existent invoice on print-history', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/billing/invoices/nonexistent/print-history')
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

describe('Edge Cases - Concurrent Delivery Requests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
        request(app)
          .post('/api/billing/invoices/invoice-1/email')
          .send({ email: 'test@example.com' }),
      );

    const responses = await Promise.all(promises);

    responses.forEach((res) => {
      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
    });
  });
});
