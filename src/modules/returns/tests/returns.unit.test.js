import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const returnRepoPath = path.resolve(__dirname, '../repositories/return.repository.js');
const creditNoteRepoPath = path.resolve(__dirname, '../repositories/credit-note.repository.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');

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
  findByInvoiceId: jest.fn(),
  getReturnStats: jest.fn(),
  generateReturnNumber: jest.fn(),
};

const mockCreditNoteRepository = {
  createCreditNote: jest.fn(),
  findById: jest.fn(),
  findByReturnId: jest.fn(),
  updateStatus: jest.fn(),
  generateCreditNoteNumber: jest.fn(),
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
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

const { default: returnService } = await import('../services/return.service.js');
const { default: creditNoteService } = await import('../services/credit-note.service.js');
const { default: refundEngine } = await import('../refund-engine/refund.engine.js');
const { default: inventoryReversalService } =
  await import('../inventory-reversal/inventory-reversal.service.js');
const { default: fraudDetectionService } =
  await import('../fraud-detection/fraud-detection.service.js');

describe('ReturnService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isWithinReturnWindow', () => {
    it('should return true for invoice within 7 days', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(returnService.isWithinReturnWindow(fiveDaysAgo)).toBe(true);
    });

    it('should return false for invoice older than 7 days', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(returnService.isWithinReturnWindow(tenDaysAgo)).toBe(false);
    });
  });

  describe('validateReturnQuantities', () => {
    it('should allow valid return quantity', () => {
      const invoiceItems = [{ id: 'item-1', quantity: 10, medicine: { name: 'Test Med' } }];
      const existingReturns = [];
      const requestedItems = [{ invoiceItemId: 'item-1', quantity: 5 }];

      expect(() =>
        returnService.validateReturnQuantities(requestedItems, invoiceItems, existingReturns),
      ).not.toThrow();
    });

    it('should throw error when return quantity exceeds sold quantity', () => {
      const invoiceItems = [{ id: 'item-1', quantity: 5, medicine: { name: 'Test Med' } }];
      const existingReturns = [];
      const requestedItems = [{ invoiceItemId: 'item-1', quantity: 10 }];

      expect(() =>
        returnService.validateReturnQuantities(requestedItems, invoiceItems, existingReturns),
      ).toThrow('Return quantity (10) exceeds available quantity (5)');
    });

    it('should prevent over-return considering existing returns', () => {
      const invoiceItems = [{ id: 'item-1', quantity: 10, medicine: { name: 'Test Med' } }];
      const existingReturns = [
        {
          items: [{ invoiceItemId: 'item-1', returnedQuantity: 7 }],
        },
      ];
      const requestedItems = [{ invoiceItemId: 'item-1', quantity: 5 }];

      expect(() =>
        returnService.validateReturnQuantities(requestedItems, invoiceItems, existingReturns),
      ).toThrow('Return quantity (5) exceeds available quantity (3)');
    });
  });

  describe('getDefaultDisposition', () => {
    it('should return DESTROY for damaged returns', () => {
      expect(returnService.getDefaultDisposition('DAMAGED_RETURN')).toBe('DESTROY');
    });

    it('should return DESTROY for expired returns', () => {
      expect(returnService.getDefaultDisposition('EXPIRED_RETURN')).toBe('DESTROY');
    });

    it('should return RESTOCK for billing corrections', () => {
      expect(returnService.getDefaultDisposition('BILLING_CORRECTION')).toBe('RESTOCK');
    });
  });
});

describe('CreditNoteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCreditNote', () => {
    it('should throw error if return not found', async () => {
      mockPrisma.return.findUnique.mockResolvedValue(null);

      await expect(
        creditNoteService.generateCreditNote('nonexistent', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Return not found');
    });

    it('should throw error if return not approved', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: 'return-1',
        status: 'REQUESTED',
        invoiceId: 'invoice-1',
        items: [],
        invoice: { branch: { code: 'CHN' } },
      });

      await expect(
        creditNoteService.generateCreditNote('return-1', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Cannot generate credit note for return in status: REQUESTED');
    });
  });
});

describe('RefundEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processRefund', () => {
    it('should throw error if return not found', async () => {
      mockPrisma.return.findUnique.mockResolvedValue(null);

      await expect(
        refundEngine.processRefund('nonexistent', 'tenant-1', 'user-1', { refundMethod: 'UPI' }),
      ).rejects.toThrow('Return not found');
    });

    it('should throw error if return not approved', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: 'return-1',
        status: 'REQUESTED',
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        items: [],
        invoice: {},
      });

      await expect(
        refundEngine.processRefund('return-1', 'tenant-1', 'user-1', { refundMethod: 'UPI' }),
      ).rejects.toThrow('Cannot process refund for return in status: REQUESTED');
    });

    it('should throw error if refund already completed', async () => {
      mockPrisma.return.findUnique.mockResolvedValue({
        id: 'return-1',
        status: 'APPROVED',
        tenantId: 'tenant-1',
        refundStatus: 'COMPLETED',
        invoiceId: 'invoice-1',
        items: [],
        invoice: {},
      });

      await expect(
        refundEngine.processRefund('return-1', 'tenant-1', 'user-1', { refundMethod: 'UPI' }),
      ).rejects.toThrow('Refund already completed');
    });
  });
});

describe('InventoryReversalService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requiresDestruction', () => {
    it('should require destruction for damaged returns', () => {
      const medicine = { name: 'Paracetamol' };
      expect(inventoryReversalService.requiresDestruction(medicine, 'DAMAGED_RETURN')).toBe(true);
    });

    it('should require destruction for expired returns', () => {
      const medicine = { name: 'Paracetamol' };
      expect(inventoryReversalService.requiresDestruction(medicine, 'EXPIRED_RETURN')).toBe(true);
    });

    it('should require destruction for cold chain medicines', () => {
      const medicine = { name: 'Insulin Injection' };
      expect(inventoryReversalService.requiresDestruction(medicine, 'CUSTOMER_RETURN')).toBe(true);
    });

    it('should not require destruction for regular medicines', () => {
      const medicine = { name: 'Paracetamol' };
      expect(inventoryReversalService.requiresDestruction(medicine, 'CUSTOMER_RETURN')).toBe(false);
    });
  });
});

describe('FraudDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRiskLevel', () => {
    it('should return HIGH for score >= 50', () => {
      expect(fraudDetectionService.calculateRiskLevel(60)).toBe('HIGH');
    });

    it('should return MEDIUM for score >= 30', () => {
      expect(fraudDetectionService.calculateRiskLevel(40)).toBe('MEDIUM');
    });

    it('should return LOW for score >= 15', () => {
      expect(fraudDetectionService.calculateRiskLevel(20)).toBe('LOW');
    });

    it('should return MINIMAL for score < 15', () => {
      expect(fraudDetectionService.calculateRiskLevel(10)).toBe('MINIMAL');
    });
  });
});
