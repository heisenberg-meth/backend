import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockTransferRepository = {
  getNextTransferNumber: jest.fn(),
  createTransfer: jest.fn(),
  updateStatus: jest.fn(),
  findById: jest.fn()
};

const mockLedgerRepository = {
  createTransaction: jest.fn()
};

const mockInventoryService = {
  recordTransaction: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(async (callback) => {
    return callback(mockPrisma);
  }),
  $queryRaw: jest.fn(),
  inventoryBatch: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  },
  inventoryTransaction: {
    create: jest.fn(),
    findUnique: jest.fn()
  },
  medicine: {
    findMany: jest.fn()
  }
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

jest.unstable_mockModule('../../src/modules/realtime-inventory/services/inventory.service.js', () => ({
  default: mockInventoryService
}));

jest.unstable_mockModule('../../src/modules/branches/repositories/transfer.repository.js', () => ({
  default: mockTransferRepository
}));

jest.unstable_mockModule('../../src/modules/stock/repositories/ledger.repository.js', () => ({
  default: mockLedgerRepository
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService
}));

const { default: transferService } = await import('../../src/modules/branches/services/transfer.service.js');
const { default: centralizedInventoryService } = await import('../../src/modules/branches/services/centralized-inventory.service.js');

describe('Multi-Branch Architecture Unit Tests', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('TransferService.requestTransfer', () => {
    it('should reserve stock and create a pending transfer', async () => {
      const data = {
        sourceBranchId: 'branch-A',
        destinationBranchId: 'branch-B',
        items: [{ batchId: 'batch-1', quantity: 10 }]
      };

      mockTransferRepository.getNextTransferNumber.mockResolvedValue('TRF-2026-000001');
      mockPrisma.$queryRaw.mockResolvedValue([{
        id: 'batch-1',
        medicineId: 'med-1',
        quantity: 50,
        reservedQuantity: 0
      }]);
      mockPrisma.inventoryBatch.update.mockResolvedValue({
        id: 'batch-1',
        quantity: 40,
        reservedQuantity: 10
      });
      mockTransferRepository.createTransfer.mockResolvedValue({ id: 'trf-1', status: 'PENDING' });

      const result = await transferService.requestTransfer(tenantId, data, userId);

      // Verify stock reservation
      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'batch-1' },
        data: { quantity: 40, reservedQuantity: 10 }
      }));

      expect(mockTransferRepository.createTransfer).toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
    });

    it('should throw an error if source stock is insufficient', async () => {
      const data = {
        sourceBranchId: 'branch-A',
        destinationBranchId: 'branch-B',
        items: [{ batchId: 'batch-1', quantity: 100 }]
      };

      mockTransferRepository.getNextTransferNumber.mockResolvedValue('TRF-2026-000001');
      mockPrisma.$queryRaw.mockResolvedValue([{
        id: 'batch-1',
        medicineId: 'med-1',
        quantity: 50,
        reservedQuantity: 0
      }]);

      await expect(transferService.requestTransfer(tenantId, data, userId))
        .rejects.toThrow('Insufficient stock in source branch for batch batch-1');
    });
  });

  describe('CentralizedInventoryService.getGlobalInventory', () => {
    it('should aggregate inventory across multiple branches correctly', async () => {
      mockPrisma.medicine.findMany.mockResolvedValue([
        {
          id: 'med-1',
          name: 'Paracetamol',
          inventoryBatches: [
            { id: 'b1', branchId: 'branch-A', quantity: 50, branch: { name: 'Store A' } },
            { id: 'b2', branchId: 'branch-B', quantity: 25, branch: { name: 'Store B' } },
            { id: 'b3', branchId: 'branch-A', quantity: 10, branch: { name: 'Store A' } }
          ]
        }
      ]);

      const result = await centralizedInventoryService.getGlobalInventory(tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].totalGlobalQuantity).toBe(85);
      
      const branchA = result[0].branchBreakdown.find(b => b.branchName === 'Store A');
      const branchB = result[0].branchBreakdown.find(b => b.branchName === 'Store B');
      
      expect(branchA.quantity).toBe(60);
      expect(branchB.quantity).toBe(25);
    });
  });
});
