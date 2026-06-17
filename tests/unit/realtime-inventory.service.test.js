import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  stockMovement: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  inventoryBatch: {
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  inventoryTransaction: {
    create: jest.fn(),
  },
  $transaction: jest.fn((cb) => cb(mockPrisma)),
};

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  scan: jest.fn().mockResolvedValue(['0', []]),
};

const mockSocket = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: mockRedis,
  quitRedis: jest.fn().mockResolvedValue(),
  getBullRedis: jest.fn(() => mockRedis),
  initRedis: jest.fn(() => mockRedis),
}));

jest.unstable_mockModule('../../src/config/socket.js', () => ({
  getIO: () => mockSocket,
}));

const mockInventoryQueue = {
  add: jest.fn().mockResolvedValue({}),
};

jest.unstable_mockModule(
  '../../src/modules/realtime-inventory/workers/inventory.worker.js',
  () => ({
    inventoryQueue: mockInventoryQueue,
  }),
);

const { default: inventoryService } =
  await import('../../src/modules/realtime-inventory/services/inventory.service.js');

describe('Real-Time Inventory Service Unit Tests', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordTransaction', () => {
    it('should record transaction, update cache and broadcast', async () => {
      const data = {
        medicineId: 'm1',
        batchId: 'b1',
        branchId: 'br1',
        movementType: 'SALE',
        quantity: -5,
        quantityAfter: 45,
        referenceType: 'INVOICE',
        referenceId: 'INV-001',
      };

      mockPrisma.stockMovement.create.mockResolvedValue({ id: 'tx1', ...data });
      mockRedis.set.mockResolvedValue('OK');

      await inventoryService.recordTransaction(mockPrisma, tenantId, data, userId);

      expect(mockPrisma.stockMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'SALE',
            quantity: -5,
          }),
        }),
      );
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockSocket.to).toHaveBeenCalledWith(`tenant:${tenantId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'INVENTORY_UPDATE',
        expect.objectContaining({
          event: 'STOCK_UPDATED',
          newQuantity: 45,
        }),
      );
    });
  });

  describe('getLiveStock', () => {
    it('should return stock from Redis if available', async () => {
      mockRedis.get.mockResolvedValue('50');

      const stock = await inventoryService.getLiveStock(tenantId, 'm1', 'br1');

      expect(stock).toBe(50);
      expect(mockPrisma.inventoryBatch.aggregate).not.toHaveBeenCalled();
    });

    it('should fetch from DB and update cache on Redis miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.inventoryBatch.aggregate.mockResolvedValue({ _sum: { availableQuantity: 100 } });

      const stock = await inventoryService.getLiveStock(tenantId, 'm1', 'br1');

      expect(stock).toBe(100);
      expect(mockPrisma.inventoryBatch.aggregate).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });
});
