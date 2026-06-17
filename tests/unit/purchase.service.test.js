import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPurchaseOrderRepository = {
  getNextPONumber: jest.fn(),
  createPO: jest.fn(),
  updateStatus: jest.fn(),
};

const mockMovementService = {
  stockIn: jest.fn(),
  stockOut: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
  purchaseInvoice: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  inventoryBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  supplierReturn: {
    create: jest.fn(),
  },
  supplierReturnItem: {
    aggregate: jest.fn(),
  },
  inventory: {
    update: jest.fn(),
  },
  stockMovement: {
    create: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
  },
  supplierCreditNote: {
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  supplier: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  supplierLedger: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockAuditService = {
  log: jest.fn(),
};

const mockLedgerService = {
  recordEntry: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(
  '../../src/modules/purchase/repositories/purchase_order.repository.js',
  () => ({
    default: mockPurchaseOrderRepository,
  }),
);

jest.unstable_mockModule('../../src/modules/stock/service/movement.service.js', () => ({
  default: mockMovementService,
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule('../../src/modules/vendors/services/ledger.service.js', () => ({
  default: mockLedgerService,
}));

const { default: purchaseService } =
  await import('../../src/modules/purchase/services/purchase.service.js');
const { default: stockInService } =
  await import('../../src/modules/purchase/services/stock-in.service.js');
const { default: supplierReturnService } =
  await import('../../src/modules/purchase/services/supplier-return.service.js');

describe('Purchase Module Unit Tests', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PurchaseService.createPO', () => {
    it('should create a PO with correct totals', async () => {
      const data = {
        supplierId: 'supp-1',
        items: [{ medicineId: 'med-1', quantity: 10, purchasePrice: 100, gstPercentage: 12 }],
      };

      mockPurchaseOrderRepository.getNextPONumber.mockResolvedValue('PO-2026-000001');
      mockPurchaseOrderRepository.createPO.mockResolvedValue({ id: 'po-1' });

      const result = await purchaseService.createPO(tenantId, data, userId);

      expect(mockPurchaseOrderRepository.createPO).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 1000,
          gstAmount: 120,
          totalAmount: 1120,
        }),
      );
      expect(result.id).toBe('po-1');
    });
  });

  describe('StockInService.receiveGoods', () => {
    it('should receive goods and create batches and ledger entry', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'supp-1', paymentTermsDays: 30 });
      mockPrisma.purchaseInvoice.create.mockResolvedValue({ id: 'pi-1' });
      mockLedgerService.recordEntry.mockResolvedValue({});
      mockMovementService.stockIn.mockResolvedValue({});
      mockPurchaseOrderRepository.updateStatus.mockResolvedValue({});

      const data = {
        supplierId: 'supp-1',
        supplierInvoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        totalAmount: 1100,
        subtotal: 1000,
        gstAmount: 100,
        items: [
          {
            medicineId: 'med-1',
            batchNumber: 'B1',
            quantity: 10,
            expiryDate: new Date(),
            purchasePrice: 100,
            sellingPrice: 150,
          },
        ],
        purchaseOrderId: 'po-1',
      };

      const result = await stockInService.receiveGoods(tenantId, data, userId);

      expect(mockPrisma.purchaseInvoice.create).toHaveBeenCalled();
      expect(mockLedgerService.recordEntry).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ type: 'PURCHASE', debitAmount: 1100 }),
        mockPrisma,
      );
      expect(mockMovementService.stockIn).toHaveBeenCalled();
      expect(mockPurchaseOrderRepository.updateStatus).toHaveBeenCalledWith(
        'po-1',
        tenantId,
        'RECEIVED',
        mockPrisma,
      );
      expect(result.id).toBe('pi-1');
    });
  });

  describe('SupplierReturnService.processReturn', () => {
    it('should process return and update ledger correctly', async () => {
      const data = {
        supplierId: 'supp-1',
        purchaseInvoiceId: 'pi-1',
        reason: 'Damaged',
        items: [{ batchId: 'batch-1', quantity: 5 }],
      };

      mockPrisma.purchaseInvoice.findUnique.mockResolvedValue({
        id: 'pi-1',
        invoiceNumber: 'INV-1',
        tenantId,
        purchaseOrder: { status: 'RECEIVED' },
        inventoryBatches: [],
      });

      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          medicineId: 'med-1',
          quantity: 10,
          receivedQuantity: 10,
          batchNumber: 'B1',
          purchasePrice: 10,
          gstPercentage: 0,
          branchId: 'branch-1',
        },
      ]);

      mockPrisma.supplier.findUnique.mockResolvedValue({
        id: 'supp-1',
        tenantId,
      });

      mockPrisma.inventoryBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        medicineId: 'med-1',
        quantity: 10,
        receivedQuantity: 10,
        batchNumber: 'B1',
        purchasePrice: 10,
        gstPercentage: 0,
        branchId: 'branch-1',
      });

      mockPrisma.supplierReturnItem.aggregate.mockResolvedValue({
        _sum: { quantity: 0 },
      });

      mockPrisma.inventory.update.mockResolvedValue({});
      mockPrisma.stockMovement.create.mockResolvedValue({});
      mockPrisma.subscription.findUnique.mockResolvedValue({
        planId: 'pro',
      });
      mockPrisma.supplierCreditNote.create.mockResolvedValue({
        id: 'cn-1',
        creditNoteNumber: 'CN-123',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      mockPrisma.supplierReturn.create.mockResolvedValue({ id: 'ret-1' });
      mockLedgerService.recordEntry.mockResolvedValue({});

      const result = await supplierReturnService.processReturn(tenantId, data, userId);

      expect(mockLedgerService.recordEntry).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ type: 'RETURN', creditAmount: 50 }),
        mockPrisma,
      );
      expect(mockPrisma.supplierReturn.create).toHaveBeenCalled();
      expect(result.id).toBe('ret-1');
    });
  });
});
