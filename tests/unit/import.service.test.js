import { jest , describe, beforeEach, it, expect } from '@jest/globals';

// Define mocks
const mockRepo = {
  createJob: jest.fn(),
  updateJob: jest.fn(),
  getJobById: jest.fn(),
  getJobs: jest.fn(),
  createExtractedItem: jest.fn(),
  findMedicineFuzzy: jest.fn(),
};

const mockOcrService = {
  extractInvoiceData: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

const mockEventBus = {
  emitEvent: jest.fn(),
};

const mockMainQueue = {
  add: jest.fn(),
};

// Mock Prisma
const mockPrisma = {
  importJob: { findFirst: jest.fn(), update: jest.fn() },
  purchaseOrder: { findFirst: jest.fn(), update: jest.fn() },
  inventoryBatch: { create: jest.fn(), findFirst: jest.fn() },
  stockTransaction: { create: jest.fn() },
  importExtractedItem: { update: jest.fn() },
  $transaction: jest.fn(async (callback) => await callback(mockPrisma)),
};

// Use unstable_mockModule for ESM
jest.unstable_mockModule('../../src/modules/import/repositories/import.repository.js', () => ({
  default: mockRepo
}));

jest.unstable_mockModule('../../src/modules/import/ocr/ocr.service.js', () => ({
  default: mockOcrService
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService
}));

jest.unstable_mockModule('../../src/shared/events/erp-event-bus.js', () => ({
  emitEvent: mockEventBus.emitEvent
}));

jest.unstable_mockModule('../../src/queue/index.js', () => ({
  mainQueue: mockMainQueue,
  worker: { close: jest.fn().mockResolvedValue() }
}));

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

// Import the service AFTER mocks are defined
const { default: importService } = await import('../../src/modules/import/services/import.service.js');

describe('ImportService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createImportJob', () => {
    it('should create a job and add it to the queue', async () => {
      const data = { type: 'PDF_INVOICE', fileName: 'test.pdf', fileUrl: 'http://test.com/test.pdf' };
      mockRepo.createJob.mockResolvedValue({ id: 'job-1', ...data });

      const result = await importService.createImportJob(data, tenantId, userId);

      expect(mockRepo.createJob).toHaveBeenCalledWith(expect.objectContaining({
        tenantId,
        uploadedBy: userId,
        importType: 'PDF_INVOICE'
      }));
      expect(mockMainQueue.add).toHaveBeenCalledWith('process-import-job', {
        jobId: 'job-1',
        tenantId,
        userId
      });
      expect(result.id).toBe('job-1');
    });
  });

  describe('processImportJob', () => {
    it('should process a PDF invoice job successfully', async () => {
      const jobId = 'job-1';
      const job = {
        id: jobId,
        tenantId,
        importType: 'PDF_INVOICE',
        fileUrl: 'http://test.com/test.pdf',
        extractedData: null
      };

      mockRepo.getJobById.mockResolvedValue(job);
      mockOcrService.extractInvoiceData.mockResolvedValue({
        confidence: 0.98,
        data: {
          supplierName: 'Test Supplier',
          invoiceNumber: 'INV-123',
          subtotal: 100,
          cgst: 9,
          sgst: 9,
          totalAmount: 118,
          medicines: [{ name: 'Medicine A', quantity: 10, unitPrice: 10, batchNumber: 'B1' }]
        }
      });
      mockRepo.findMedicineFuzzy.mockResolvedValue({ id: 'med-1', name: 'Medicine A' });
      mockPrisma.importJob.findFirst.mockResolvedValue(null); // No duplicate

      await importService.processImportJob(jobId, tenantId);

      expect(mockRepo.updateJob).toHaveBeenCalledWith(jobId, tenantId, { importStatus: 'PROCESSING' });
      expect(mockOcrService.extractInvoiceData).toHaveBeenCalledWith(job.fileUrl);
      expect(mockRepo.createExtractedItem).toHaveBeenCalledWith(expect.objectContaining({
        extractedName: 'Medicine A',
        matchedMedicineId: 'med-1'
      }));
      expect(mockRepo.updateJob).toHaveBeenCalledWith(jobId, tenantId, { importStatus: 'AUTO_APPROVED' });
    });

    it('should fail if duplicate invoice is detected', async () => {
      const jobId = 'job-1';
      const job = {
        id: jobId,
        tenantId,
        importType: 'PDF_INVOICE',
        fileUrl: 'http://test.com/test.pdf'
      };

      mockRepo.getJobById.mockResolvedValue(job);
      mockOcrService.extractInvoiceData.mockResolvedValue({
        confidence: 0.99,
        data: { invoiceNumber: 'DUPE-123' }
      });
      mockPrisma.importJob.findFirst.mockResolvedValue({ id: 'other-job' }); // Duplicate found

      await importService.processImportJob(jobId, tenantId);

      expect(mockRepo.updateJob).toHaveBeenCalledWith(jobId, tenantId, expect.objectContaining({
        importStatus: 'FAILED',
        errorMessage: 'Invoice DUPE-123 already imported'
      }));
    });
  });

  describe('approveImport', () => {
    it('should create inventory batches and stock transactions', async () => {
      const jobId = 'job-1';
      const job = {
        id: jobId,
        tenantId,
        importStatus: 'REVIEW_REQUIRED',
        extractedItems: [
          {
            id: 'item-1',
            matchedMedicineId: 'med-1',
            quantity: 10,
            unitPrice: 100,
            batchNumber: 'B1',
            expiryDate: new Date()
          }
        ]
      };

      mockRepo.getJobById.mockResolvedValue(job);
      mockPrisma.importJob.update.mockResolvedValue({ id: jobId, importStatus: 'COMPLETED' });

      const result = await importService.approveImport(jobId, tenantId, userId);

      expect(mockPrisma.inventoryBatch.create).toHaveBeenCalled();
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalled();
      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ importStatus: 'COMPLETED' })
      }));
      expect(result.importStatus).toBe('COMPLETED');
    });
  });
});
