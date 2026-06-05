import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfRendererPath = path.resolve(__dirname, '../services/pdf-renderer.service.js');
const s3StoragePath = path.resolve(__dirname, '../services/s3-storage.service.js');

const mockPrisma = {
  invoice: {
    findUnique: jest.fn(),
  },
  invoiceDeliveryLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const mockPdfRenderer = {
  renderA4: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
  renderThermal: jest.fn().mockResolvedValue(Buffer.from('mock-thermal-pdf')),
};

const mockS3Storage = {
  uploadPDF: jest
    .fn()
    .mockResolvedValue({ url: 's3://bucket/key', key: 'invoices/tenant-1/original/inv-1.pdf' }),
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com/pdf'),
  generatePDFKey: jest.fn().mockReturnValue('invoices/tenant-1/original/inv-1.pdf'),
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: mockLogger,
}));

jest.unstable_mockModule('../../settings/invoice-template/invoice-template.service.js', () => ({
  default: {
    getTemplate: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule(pdfRendererPath, () => ({
  default: mockPdfRenderer,
}));

jest.unstable_mockModule(s3StoragePath, () => ({
  default: mockS3Storage,
}));

const { default: pdfGenerationService } = await import('../services/pdf-generation.service.js');

describe('PdfGenerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndStore', () => {
    it('should generate PDF and store with signed URL', async () => {
      const mockInvoice = {
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
        tenant: {
          name: 'Test Pharmacy',
          gstin: '27AAPFU0939F1ZV',
        },
      };

      const mockDeliveryLog = {
        id: 'log-1',
        pdfUrl: 'https://signed-url.example.com/pdf',
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue(mockDeliveryLog);

      const result = await pdfGenerationService.generateAndStore('invoice-1', 'tenant-1');

      expect(result.pdfUrl).toBe('https://signed-url.example.com/pdf');
      expect(result.deliveryLogId).toBe('log-1');
      expect(mockPrisma.invoice.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invoice-1' },
          include: expect.any(Object),
        }),
      );
    });

    it('should throw error for cancelled invoice without watermark', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        status: 'CANCELLED',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(pdfGenerationService.generateAndStore('invoice-1', 'tenant-1')).rejects.toThrow(
        'Cannot generate PDF for cancelled invoice without watermark',
      );
    });

    it('should throw error when invoice not found', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        pdfGenerationService.generateAndStore('nonexistent', 'tenant-1'),
      ).rejects.toThrow('Invoice not found: nonexistent');
    });

    it('should generate PDF with watermark when specified', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        status: 'ACTIVE',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      };

      const mockDeliveryLog = {
        id: 'log-1',
        pdfUrl: 'https://signed-url.example.com/pdf',
        expiresAt: new Date(Date.now() + 3600000),
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue(mockDeliveryLog);

      await pdfGenerationService.generateAndStore('invoice-1', 'tenant-1', {
        watermark: 'PAID',
      });

      expect(mockPrisma.invoiceDeliveryLog.create).toHaveBeenCalled();
    });
  });
});
