import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const movementServicePath = path.resolve(__dirname, '../../stock/service/movement.service.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const eventsConstantsPath = path.resolve(__dirname, '../../../shared/constants/events.js');
const invoiceRepositoryPath = path.resolve(__dirname, '../repositories/invoice.repository.js');
const invoiceEnginePath = path.resolve(__dirname, '../invoice-engine/invoice.engine.js');

const mockPrisma = {
  $transaction: jest.fn((cb) =>
    cb({
      branch: { findUnique: jest.fn() },
      patient: { findUnique: jest.fn() },
      medicine: { findFirst: jest.fn() },
      inventoryBatch: { findFirst: jest.fn(), update: jest.fn() },
      invoice: { create: jest.fn() },
      invoicePayment: { create: jest.fn() },
      stockTransaction: { create: jest.fn() },
    }),
  ),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
  __esModule: true,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    scan: jest.fn().mockResolvedValue(['0', []]),
  },
  initRedis: jest.fn(),
  getBullRedis: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    scan: jest.fn().mockResolvedValue(['0', []]),
  }),
  connectRedis: jest.fn(),
  quitRedis: jest.fn(),
}));

jest.unstable_mockModule(movementServicePath, () => ({
  default: {
    stockOut: jest.fn().mockResolvedValue({
      totalDeducted: 2,
      deductions: [{ batchId: 'batch-1', quantity: 2, branchId: 'branch-1' }],
    }),
    recordMovement: jest.fn().mockResolvedValue({}),
  },
  __esModule: true,
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
  erpEventBus: { add: jest.fn(), close: jest.fn() },
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: jest.fn(),
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(eventsConstantsPath, () => ({
  DOMAIN_EVENTS: {
    INVOICE_CREATED: 'invoice.created',
  },
  EVENTS: {
    INVOICE_CREATED: 'invoice.created',
  },
}));

jest.unstable_mockModule(invoiceRepositoryPath, () => ({
  default: {
    getNextInvoiceNumber: jest.fn().mockResolvedValue('INV-2026-001'),
  },
  __esModule: true,
}));

const [{ default: invoiceEngine }, { default: prisma }, { default: movementService }] =
  await Promise.all([import(invoiceEnginePath), import(prismaPath), import(movementServicePath)]);

describe('InvoiceEngine', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  it('should calculate Indian GST correctly (Intrastate)', async () => {
    const data = {
      branchId: 'branch-1',
      items: [
        {
          medicineId: 'med-1',
          quantity: 2,
          unitPrice: 100,
          discountPercentage: 0,
          batchId: 'batch-1',
          medicineName: 'Dolo',
          gstPercentage: 12,
        },
      ],
      payments: [{ paymentMode: 'CASH', amount: 224 }],
      paymentMethod: 'CASH',
    };

    const mockTx = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'branch-1', gstNumber: '27AAAAA0000A1Z5' }),
      },
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', gstNumber: '27BBBBB0000A1Z5' }),
      },
      storeProfile: { findFirst: jest.fn().mockResolvedValue({ gstin: '27AAAAA0000A1Z5' }) },
      medicine: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'med-1',
          name: 'Dolo',
          unitPrice: 100,
          gstPercentage: 12,
          isActive: true,
          prescriptionRequired: false,
        }),
      },
      invoice: {
        create: jest.fn().mockImplementation((args) => ({ ...args.data, id: 'inv-1' })),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', batchNumber: 'B1', availableQuantity: 100 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'batch-1' }]),
      },
      invoiceItem: { createMany: jest.fn() },
      invoicePayment: { create: jest.fn() },
      invoiceAuditLog: { create: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

    const result = await invoiceEngine.createDraft(tenantId, userId, data);

    expect(result.totalAmount).toBe(224);
    expect(result.cgst).toBe(12);
    expect(result.sgst).toBe(12);
    expect(result.igst).toBe(0);
  });

  it('should calculate Indian GST correctly (Interstate)', async () => {
    const data = {
      branchId: 'branch-1',
      patientId: 'cust-1',
      items: [
        {
          medicineId: 'med-1',
          quantity: 2,
          unitPrice: 100,
          discountPercentage: 0,
          batchId: 'batch-1',
          medicineName: 'Dolo',
          gstPercentage: 18,
        },
      ],
      payments: [{ paymentMode: 'UPI', amount: 236 }],
      paymentMethod: 'UPI',
    };

    const mockTx = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({ id: 'branch-1', gstNumber: '27AAAAA0000A1Z5' }),
      },
      patient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cust-1', gstNumber: '29BBBBB0000A1Z5' }),
      },
      storeProfile: { findFirst: jest.fn().mockResolvedValue({ gstin: '27AAAAA0000A1Z5' }) },
      medicine: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'med-1',
          name: 'Dolo',
          unitPrice: 100,
          gstPercentage: 18,
          isActive: true,
          prescriptionRequired: false,
        }),
      },
      invoice: {
        create: jest.fn().mockImplementation((args) => ({ ...args.data, id: 'inv-2' })),
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryBatch: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'batch-1', batchNumber: 'B1', availableQuantity: 100 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'batch-1' }]),
      },
      invoiceItem: { createMany: jest.fn() },
      invoicePayment: { create: jest.fn() },
      invoiceAuditLog: { create: jest.fn() },
    };

    prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

    const result = await invoiceEngine.createDraft(tenantId, userId, data);

    expect(result.totalAmount).toBe(236);
    expect(result.gstAmount).toBe(36);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
    expect(result.igst).toBe(36);
  });

  describe('FEFO Multi-Batch Stock Allocation (PRD)', () => {
    const branchId = 'branch-1';
    const medicineId = 'med-1';
    const invoice = { id: 'inv-1', invoiceNumber: 'INV-2026-000001', branchId };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('Test 1: First batch has enough stock (single batch deduction)', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-89769',
          availableQuantity: 59,
          expiryDate: new Date('2026-10-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-SECOND',
          availableQuantity: 100,
          expiryDate: new Date('2026-12-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
        inventoryBatch: { findMany: jest.fn().mockResolvedValue(mockBatches) },
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-A',
        quantity: 50,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      expect(allocations).toEqual([{ id: 'batch-A', quantity: 50, batchNumber: 'BATCH-89769' }]);
      expect(movementService.recordMovement).toHaveBeenCalledTimes(1);
      expect(movementService.recordMovement).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({
          medicineId,
          batchId: 'batch-A',
          quantity: -50,
          movementType: 'SALE',
        }),
        userId,
        mockTx,
      );
    });

    it('Test 2: First batch insufficient, second batch sufficient (multi-batch deduction)', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-89769',
          availableQuantity: 59,
          expiryDate: new Date('2026-10-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-SECOND',
          availableQuantity: 100,
          expiryDate: new Date('2026-12-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
        inventoryBatch: { findMany: jest.fn().mockResolvedValue(mockBatches) },
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-A',
        quantity: 100,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      expect(allocations).toEqual([
        { id: 'batch-A', quantity: 59, batchNumber: 'BATCH-89769' },
        { id: 'batch-B', quantity: 41, batchNumber: 'BATCH-SECOND' },
      ]);
      expect(movementService.recordMovement).toHaveBeenCalledTimes(2);
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        1,
        tenantId,
        expect.objectContaining({
          medicineId,
          batchId: 'batch-A',
          quantity: -59,
          movementType: 'SALE',
        }),
        userId,
        mockTx,
      );
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        2,
        tenantId,
        expect.objectContaining({
          medicineId,
          batchId: 'batch-B',
          quantity: -41,
          movementType: 'SALE',
        }),
        userId,
        mockTx,
      );
    });

    it('Test 3: First + second insufficient, third batch required (3-batch allocation)', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-A',
          availableQuantity: 30,
          expiryDate: new Date('2026-08-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-B',
          availableQuantity: 20,
          expiryDate: new Date('2026-09-01'),
        },
        {
          id: 'batch-C',
          batchNumber: 'BATCH-C',
          availableQuantity: 100,
          expiryDate: new Date('2026-10-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
      };

      const item = {
        medicineId,
        medicineName: 'Test Med',
        batchId: 'batch-A',
        quantity: 75,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      expect(allocations).toEqual([
        { id: 'batch-A', quantity: 30, batchNumber: 'BATCH-A' },
        { id: 'batch-B', quantity: 20, batchNumber: 'BATCH-B' },
        { id: 'batch-C', quantity: 25, batchNumber: 'BATCH-C' },
      ]);
      expect(movementService.recordMovement).toHaveBeenCalledTimes(3);
    });

    it('Test 4: Combined stock insufficient (checkout rejected, no stock deducted)', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-A',
          availableQuantity: 30,
          expiryDate: new Date('2026-08-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-B',
          availableQuantity: 20,
          expiryDate: new Date('2026-09-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-A',
        quantity: 75,
      };

      await expect(
        invoiceEngine._processItemDeduction(tenantId, invoice, item, userId, mockTx),
      ).rejects.toThrow(
        'Medicine "Actrapid HM (Bottle)" has insufficient stock available (missing 25)',
      );

      expect(movementService.recordMovement).not.toHaveBeenCalled();
    });

    it('Test 5: Expired first batch + valid second batch (expired batch skipped, valid batch used)', async () => {
      // In DB query, expired batches (expiryDate <= NOW()) are excluded by _getAvailableBatches
      const validBatches = [
        {
          id: 'batch-B',
          batchNumber: 'BATCH-VALID',
          availableQuantity: 100,
          expiryDate: new Date('2028-01-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(validBatches),
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-EXPIRED',
        quantity: 50,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      expect(allocations).toEqual([{ id: 'batch-B', quantity: 50, batchNumber: 'BATCH-VALID' }]);
      expect(movementService.recordMovement).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ batchId: 'batch-B', quantity: -50 }),
        userId,
        mockTx,
      );
    });

    it('Test 6: Requested quantity exactly equals combined stock (checkout succeeds, remaining = 0)', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-A',
          availableQuantity: 59,
          expiryDate: new Date('2026-10-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-B',
          availableQuantity: 41,
          expiryDate: new Date('2026-12-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-A',
        quantity: 100,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      expect(allocations).toEqual([
        { id: 'batch-A', quantity: 59, batchNumber: 'BATCH-A' },
        { id: 'batch-B', quantity: 41, batchNumber: 'BATCH-B' },
      ]);
      expect(movementService.recordMovement).toHaveBeenCalledTimes(2);
    });

    it('Test 7: Preferred batch specified is moved to front and consumed first', async () => {
      const mockBatches = [
        {
          id: 'batch-FEFO-1',
          batchNumber: 'B-EARLIEST',
          availableQuantity: 40,
          expiryDate: new Date('2026-06-01'),
        },
        {
          id: 'batch-PREFERRED',
          batchNumber: 'B-PREFERRED',
          availableQuantity: 50,
          expiryDate: new Date('2026-11-01'),
        },
        {
          id: 'batch-FEFO-2',
          batchNumber: 'B-LATEST',
          availableQuantity: 100,
          expiryDate: new Date('2027-01-01'),
        },
      ];

      const mockTx = {
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
      };

      const item = {
        medicineId,
        medicineName: 'Actrapid HM (Bottle)',
        batchId: 'batch-PREFERRED',
        quantity: 70,
      };

      const allocations = await invoiceEngine._processItemDeduction(
        tenantId,
        invoice,
        item,
        userId,
        mockTx,
      );

      // Should consume preferred batch (50) first, then remaining (20) from earliest batch
      expect(allocations).toEqual([
        { id: 'batch-PREFERRED', quantity: 50, batchNumber: 'B-PREFERRED' },
        { id: 'batch-FEFO-1', quantity: 20, batchNumber: 'B-EARLIEST' },
      ]);
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        1,
        tenantId,
        expect.objectContaining({ batchId: 'batch-PREFERRED', quantity: -50 }),
        userId,
        mockTx,
      );
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        2,
        tenantId,
        expect.objectContaining({ batchId: 'batch-FEFO-1', quantity: -20 }),
        userId,
        mockTx,
      );
    });

    it('Finalize: successfully deducts across multiple batches and marks invoice FINALIZED', async () => {
      const mockBatches = [
        {
          id: 'batch-A',
          batchNumber: 'BATCH-89769',
          availableQuantity: 59,
          expiryDate: new Date('2026-10-01'),
        },
        {
          id: 'batch-B',
          batchNumber: 'BATCH-SECOND',
          availableQuantity: 100,
          expiryDate: new Date('2026-12-01'),
        },
      ];

      const draftInvoice = {
        id: 'inv-draft-1',
        tenantId,
        branchId,
        status: 'DRAFT',
        invoiceNumber: 'INV-2026-000001',
        patientId: null,
        subtotal: 1000,
        discountAmount: 0,
        gstAmount: 120,
        totalAmount: 1120,
        items: [
          {
            id: 'item-1',
            medicineId,
            batchId: 'batch-A',
            quantity: 100,
            unitPrice: 10,
            cgst: 60,
            sgst: 60,
            igst: 0,
            medicine: { id: medicineId, name: 'Actrapid HM (Bottle)' },
          },
        ],
      };

      const mockTx = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue(draftInvoice),
          findUnique: jest.fn().mockResolvedValue({ ...draftInvoice, items: draftInvoice.items }),
          update: jest.fn().mockImplementation((args) => ({ ...draftInvoice, ...args.data })),
        },
        inventoryBatch: {
          findMany: jest.fn().mockResolvedValue(mockBatches),
        },
        $queryRaw: jest.fn().mockResolvedValue(mockBatches),
        sale: {
          create: jest.fn().mockResolvedValue({ id: 'sale-1' }),
        },
        saleItem: {
          create: jest.fn().mockResolvedValue({ id: 'sale-item-1' }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        invoiceAuditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
        patientLoyaltyAccount: {
          findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', points: 0 }),
          update: jest.fn().mockResolvedValue({ id: 'acc-1', points: 10 }),
          create: jest.fn().mockResolvedValue({ id: 'acc-1', points: 0 }),
        },
        loyaltyPointTransaction: {
          create: jest.fn().mockResolvedValue({ id: 'lpt-1' }),
        },
      };

      prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

      const finalized = await invoiceEngine.finalize(
        'inv-draft-1',
        tenantId,
        userId,
        mockTx,
        'CASH',
      );

      expect(finalized.status).toBe('FINALIZED');
      expect(movementService.recordMovement).toHaveBeenCalledTimes(2);
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        1,
        tenantId,
        expect.objectContaining({ batchId: 'batch-A', quantity: -59, movementType: 'SALE' }),
        userId,
        mockTx,
      );
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        2,
        tenantId,
        expect.objectContaining({ batchId: 'batch-B', quantity: -41, movementType: 'SALE' }),
        userId,
        mockTx,
      );
    });

    it('Cancel: restores stock movements for each batch that was deducted', async () => {
      const finalizedInvoice = {
        id: 'inv-fin-1',
        tenantId,
        branchId,
        status: 'FINALIZED',
        invoiceNumber: 'INV-2026-000001',
        items: [
          {
            id: 'item-1',
            medicineId,
            batchId: 'batch-A',
            quantity: 100,
          },
        ],
      };

      const mockMovements = [
        { id: 'mov-1', medicineId, batchId: 'batch-A', quantity: -59, movementType: 'SALE' },
        { id: 'mov-2', medicineId, batchId: 'batch-B', quantity: -41, movementType: 'SALE' },
      ];

      const mockTx = {
        invoice: {
          findFirst: jest.fn().mockResolvedValue(finalizedInvoice),
          update: jest.fn().mockImplementation((args) => ({ ...finalizedInvoice, ...args.data })),
        },
        stockMovement: {
          findMany: jest.fn().mockResolvedValue(mockMovements),
        },
        invoiceAuditLog: {
          create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };

      prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

      const cancelled = await invoiceEngine.cancel(
        'inv-fin-1',
        tenantId,
        userId,
        'Patient cancelled',
      );

      expect(cancelled.status).toBe('CANCELLED');
      expect(movementService.recordMovement).toHaveBeenCalledTimes(2);
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        1,
        tenantId,
        expect.objectContaining({
          batchId: 'batch-A',
          quantity: 59,
          movementType: 'RETURN',
        }),
        userId,
        mockTx,
      );
      expect(movementService.recordMovement).toHaveBeenNthCalledWith(
        2,
        tenantId,
        expect.objectContaining({
          batchId: 'batch-B',
          quantity: 41,
          movementType: 'RETURN',
        }),
        userId,
        mockTx,
      );
    });
  });
});
