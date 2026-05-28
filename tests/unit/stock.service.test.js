import { jest , describe, afterEach, it, expect } from '@jest/globals';

// Mocks
const mockLedgerRepository = {
  createTransaction: jest.fn(),
};

const mockStockRepository = {
  getCurrentStock: jest.fn(),
  findBatchById: jest.fn(),
};

const mockInventoryService = {
  recordTransaction: jest.fn(),
};

const mockInventorySyncService = {
  triggerSync: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn((callback) => callback(mockPrisma)),
  $queryRaw: jest.fn(),
  medicine: {
    findUnique: jest.fn().mockResolvedValue({ reorderLevel: 5, name: 'Paracetamol' }),
  },
  inventoryBatch: {
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 'b1' }),
  },
  inventory: {
    upsert: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'NORMAL' }),
    update: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'NORMAL' }),
    findUnique: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'NORMAL' }),
  },
  inventoryTransaction: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  stockTransaction: {
    create: jest.fn(),
  },
  damagedStock: {
    create: jest.fn(),
  },
  inventorySyncLog: {
    create: jest.fn(),
  },
  stockMovement: {
    create: jest.fn().mockResolvedValue({ id: 'mov-1' }),
  },
};

// Use relative paths from the test file to the mocked module
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  connect: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedisClient,
  initRedis: jest.fn(() => mockRedisClient),
  connectRedis: jest.fn(),
  quitRedis: jest.fn(),
  getBullRedis: jest.fn(() => mockRedisClient),
}));

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn().mockImplementation(() => mockRedisClient),
}));

jest.unstable_mockModule('../../src/modules/stock/repositories/stock.repository.js', () => ({
  default: mockStockRepository
}));

jest.unstable_mockModule('../../src/modules/stock/repositories/ledger.repository.js', () => ({
  default: mockLedgerRepository
}));

jest.unstable_mockModule('../../src/modules/realtime-inventory/services/inventory.service.js', () => ({
  default: mockInventoryService
}));

jest.unstable_mockModule('../../src/modules/ecommerce/services/inventory-sync.service.js', () => ({
  default: mockInventorySyncService
}));

// Import after mocks are defined
const { default: movementService } = await import('../../src/modules/stock/service/movement.service.js');

describe('MovementService Unit Tests (Stock)', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stockOut - FEFO Strategy', () => {
    it.skip('should deduct from the earliest expiring batch first', async () => {
      const medicineId = 'med-1';
      const now = new Date();
      const future1 = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
      const future2 = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 60);

      const mockBatches = [
        { id: 'b1', expiryDate: future1, quantity: 10, availableQuantity: 10 },
        { id: 'b2', expiryDate: future2, quantity: 50, availableQuantity: 50 },
      ];

      mockPrisma.inventoryBatch.findMany.mockResolvedValue(mockBatches);
      mockPrisma.inventoryBatch.update.mockResolvedValue({});
      mockLedgerRepository.createTransaction.mockResolvedValue({});

      const result = await movementService.stockOut(tenantId, {
        medicineId,
        quantity: 15,
        type: 'SALE'
      }, userId);

      expect(result.totalDeducted).toBe(15);
      
      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'b1' },
        data: { quantity: 0, availableQuantity: 0 }
      }));

      expect(mockPrisma.inventoryBatch.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'b2' },
        data: { quantity: 45, availableQuantity: 45 }
      }));
    });

    it.skip('should throw error if insufficient total stock', async () => {
      const medicineId = 'med-1';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      mockPrisma.inventoryBatch.findMany.mockResolvedValue([
        { id: 'b1', quantity: 5, availableQuantity: 5, expiryDate: futureDate }
      ]);

      await expect(movementService.stockOut(tenantId, {
        medicineId,
        quantity: 10,
        type: 'SALE'
      }, userId)).rejects.toThrow('Insufficient stock');
    });
  });

  describe('stockIn', () => {
    it.skip('should create a new batch and ledger entry', async () => {
      const data = {
        medicineId: 'med-1',
        batchNumber: 'P001',
        quantity: 100,
        expiryDate: '2027-01-01',
        purchasePrice: 10,
        sellingPrice: 15
      };

      mockStockRepository.getCurrentStock.mockResolvedValue({ totalQuantity: 0 });
      mockPrisma.inventoryBatch.create.mockResolvedValue({ id: 'b1', ...data });
      mockLedgerRepository.createTransaction.mockResolvedValue({});

      const result = await movementService.stockIn(tenantId, data, userId);

      expect(mockPrisma.inventoryBatch.create).toHaveBeenCalled();
      expect(mockLedgerRepository.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'STOCK_IN',
        quantity: 100,
        previousStock: 0,
        newStock: 100
      }), mockPrisma);
      expect(result.id).toBe('b1');
    });
  });
});
