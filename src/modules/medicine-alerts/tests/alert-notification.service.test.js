import { jest, describe, beforeEach, it, expect } from '@jest/globals';

const mockPrisma = {
  medicine: {
    findUnique: jest.fn(),
  },
  inventoryBatch: {
    findUnique: jest.fn(),
  },
  branch: {
    findUnique: jest.fn(),
  },
  stockAlert: {
    create: jest.fn(),
  },
  expiryAlert: {
    create: jest.fn(),
  },
  notification: {
    create: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockErpEventBus = {
  emitEvent: jest.fn(),
};

jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../../../config/redis.js', () => ({
  default: mockRedis,
}));

jest.unstable_mockModule('../../../shared/events/erp-event-bus.js', () => ({
  emitEvent: mockErpEventBus.emitEvent,
}));

// Import AFTER mocking
const { default: alertNotificationService } =
  await import('../notifications/alert-notification.service.js');
const { default: prisma } = await import('../../../config/prisma.js');
const { default: redisClient } = await import('../../../config/redis.js');

describe('AlertNotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notifyLowStock', () => {
    it('should send notifications for low stock alerts', async () => {
      redisClient.get.mockResolvedValue(null);
      prisma.medicine.findUnique.mockResolvedValue({
        name: 'Dolo 650',
        genericName: 'Paracetamol',
      });
      prisma.branch.findUnique.mockResolvedValue({ name: 'Main Branch', code: 'MB01' });
      prisma.stockAlert.create.mockResolvedValue({ id: 'alert-1' });

      await alertNotificationService.notifyLowStock({
        medicineId: 'med-1',
        currentStock: 5,
        threshold: 20,
        tenantId: 'tenant-1',
        branchId: 'branch-1',
      });

      expect(prisma.stockAlert.create).toHaveBeenCalled();
    });

    it('should skip notification if dedup key exists', async () => {
      redisClient.get.mockResolvedValue('1');

      await alertNotificationService.notifyLowStock({
        medicineId: 'med-1',
        currentStock: 5,
        threshold: 20,
        tenantId: 'tenant-1',
      });

      expect(prisma.stockAlert.create).not.toHaveBeenCalled();
    });
  });

  describe('notifyExpiryWarning', () => {
    it('should send expiry warning with potential loss calculation', async () => {
      redisClient.get.mockResolvedValue(null);
      prisma.inventoryBatch.findUnique.mockResolvedValue({
        batchNumber: 'B123',
        quantity: 100,
        purchasePrice: 10,
        medicine: { name: 'Insulin' },
      });
      prisma.medicine.findUnique.mockResolvedValue({
        name: 'Insulin',
        genericName: 'Insulin Glargine',
      });
      prisma.stockAlert.create.mockResolvedValue({ id: 'alert-1' });

      await alertNotificationService.notifyExpiryWarning({
        batchId: 'batch-1',
        medicineId: 'med-1',
        daysRemaining: 15,
        tenantId: 'tenant-1',
      });

      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'EXPIRY_WARNING',
            medicineId: 'med-1',
          }),
        }),
      );
    });
  });

  describe('notifyOutOfStock', () => {
    it('should send urgent notification for out of stock', async () => {
      redisClient.get.mockResolvedValue(null);
      prisma.medicine.findUnique.mockResolvedValue({
        name: 'Critical Med',
        genericName: 'Critical',
      });
      prisma.stockAlert.create.mockResolvedValue({ id: 'alert-1' });

      await alertNotificationService.notifyOutOfStock({
        medicineId: 'med-1',
        tenantId: 'tenant-1',
        severity: 'CRITICAL',
      });

      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'OUT_OF_STOCK',
            severity: 'CRITICAL',
          }),
        }),
      );
    });
  });

  describe('notifyTransferRecommendation', () => {
    it('should send transfer recommendation notification', async () => {
      prisma.stockAlert.create.mockResolvedValue({ id: 'alert-1' });

      await alertNotificationService.notifyTransferRecommendation(
        'tenant-1',
        'branch-id',
        'med-1',
        'Medicine Name',
        100,
      );

      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TRANSFER_RECOMMENDED',
          }),
        }),
      );
    });
  });
});
