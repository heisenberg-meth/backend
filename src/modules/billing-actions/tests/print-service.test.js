import { jest , describe, beforeEach, it, expect } from '@jest/globals';

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

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../shared/events/local-event-bus.js', () => ({
  emitLocalEvent: jest.fn(), localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/utils/logger.js', () => ({
  default: mockLogger,
}));

const { default: printService } = await import('../services/print.service.js');
const { default: deliveryAuditService } = await import('../services/delivery-audit.service.js');

describe('PrintService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPrintJob', () => {
    it('should create a print job with default A4 printer type', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      };

      const mockPrintJob = {
        id: 'print-job-1',
        invoiceId: 'invoice-1',
        printerType: 'A4',
        copies: 1,
        printStatus: 'PENDING',
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.invoicePrintJob.create.mockResolvedValue(mockPrintJob);

      const result = await printService.createPrintJob('invoice-1', 'tenant-1', {});

      expect(result.printerType).toBe('A4');
      expect(result.printStatus).toBe('PENDING');
      expect(mockPrisma.invoicePrintJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'invoice-1',
            tenantId: 'tenant-1',
            printerType: 'A4',
            copies: 1,
          }),
        })
      );
    });

    it('should create a print job with specified printer type and copies', async () => {
      const mockInvoice = {
        id: 'invoice-1',
        items: [],
        tenant: { name: 'Test Pharmacy' },
      };

      const mockPrintJob = {
        id: 'print-job-1',
        invoiceId: 'invoice-1',
        printerType: 'THERMAL_80MM',
        copies: 3,
        printStatus: 'PENDING',
      };

      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockPrisma.invoicePrintJob.create.mockResolvedValue(mockPrintJob);

      const result = await printService.createPrintJob('invoice-1', 'tenant-1', {
        printerType: 'THERMAL_80MM',
        copies: 3,
      });

      expect(result.printerType).toBe('THERMAL_80MM');
      expect(result.copies).toBe(3);
    });

    it('should throw error when invoice not found', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(
        printService.createPrintJob('nonexistent', 'tenant-1')
      ).rejects.toThrow('Invoice not found: nonexistent');
    });
  });

  describe('getPrintJobsForInvoice', () => {
    it('should return print jobs ordered by createdAt desc', async () => {
      const mockJobs = [
        { id: 'job-2', createdAt: new Date('2024-01-02') },
        { id: 'job-1', createdAt: new Date('2024-01-01') },
      ];

      mockPrisma.invoicePrintJob.findMany.mockResolvedValue(mockJobs);

      const result = await printService.getPrintJobsForInvoice('invoice-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.invoicePrintJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoiceId: 'invoice-1' },
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });
});

describe('DeliveryAuditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logDelivery', () => {
    it('should create a delivery log entry', async () => {
      const mockLog = {
        id: 'log-1',
        invoiceId: 'invoice-1',
        deliveryChannel: 'EMAIL',
        deliveryStatus: 'QUEUED',
        recipient: 'test@example.com',
      };

      mockPrisma.invoiceDeliveryLog.create.mockResolvedValue(mockLog);

      const result = await deliveryAuditService.logDelivery({
        invoiceId: 'invoice-1',
        tenantId: 'tenant-1',
        deliveryChannel: 'EMAIL',
        recipient: 'test@example.com',
      });

      expect(result.deliveryStatus).toBe('QUEUED');
      expect(mockPrisma.invoiceDeliveryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invoiceId: 'invoice-1',
            deliveryChannel: 'EMAIL',
            recipient: 'test@example.com',
          }),
        })
      );
    });
  });

  describe('updateDeliveryStatus', () => {
    it('should update delivery log status', async () => {
      const mockUpdatedLog = {
        id: 'log-1',
        deliveryStatus: 'SENT',
        providerMessageId: 'msg-123',
      };

      mockPrisma.invoiceDeliveryLog.update.mockResolvedValue(mockUpdatedLog);

      const result = await deliveryAuditService.updateDeliveryStatus('log-1', 'SENT', {
        providerMessageId: 'msg-123',
      });

      expect(result.deliveryStatus).toBe('SENT');
      expect(mockPrisma.invoiceDeliveryLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'log-1' },
          data: expect.objectContaining({
            deliveryStatus: 'SENT',
            providerMessageId: 'msg-123',
          }),
        })
      );
    });
  });

  describe('getDeliveryStats', () => {
    it('should return aggregated delivery statistics', async () => {
      const mockLogs = [
        { deliveryChannel: 'EMAIL', deliveryStatus: 'SENT', createdAt: new Date() },
        { deliveryChannel: 'WHATSAPP', deliveryStatus: 'DELIVERED', createdAt: new Date() },
        { deliveryChannel: 'EMAIL', deliveryStatus: 'FAILED', createdAt: new Date() },
      ];

      mockPrisma.invoiceDeliveryLog.findMany.mockResolvedValue(mockLogs);

      const stats = await deliveryAuditService.getDeliveryStats('invoice-1');

      expect(stats.total).toBe(3);
      expect(stats.byChannel.EMAIL).toBe(2);
      expect(stats.byChannel.WHATSAPP).toBe(1);
      expect(stats.byStatus.SENT).toBe(1);
      expect(stats.byStatus.DELIVERED).toBe(1);
      expect(stats.byStatus.FAILED).toBe(1);
    });
  });
});
