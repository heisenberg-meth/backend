import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockBatchRepository = {
  findAll: jest.fn(),
  updateStatus: jest.fn(),
  getNearExpiry: jest.fn(),
  quarantineBatch: jest.fn()
};

const mockExpiryAlertRepository = {
  findExistingAlert: jest.fn(),
  createAlert: jest.fn(),
};

const mockRecommendationRepository = {
  clearRecommendations: jest.fn(),
  upsertRecommendation: jest.fn(),
};

const mockPrisma = {
  tenant: {
    findMany: jest.fn()
  },
  inventoryTransaction: {
    create: jest.fn(),
    findUnique: jest.fn()
  }
};

const mockInventoryService = {
  recordTransaction: jest.fn(),
};

const mockEventBus = {
  publish: jest.fn(),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma
}));

jest.unstable_mockModule('../../src/shared/services/eventbus.service.js', () => ({
  default: mockEventBus
}));

jest.unstable_mockModule('../../src/modules/realtime-inventory/services/inventory.service.js', () => ({
  default: mockInventoryService
}));

jest.unstable_mockModule('../../src/modules/expiry-intelligence/repositories/batch.repository.js', () => ({
  default: mockBatchRepository
}));

jest.unstable_mockModule('../../src/modules/expiry-intelligence/repositories/expiry_alert.repository.js', () => ({
  default: mockExpiryAlertRepository
}));

jest.unstable_mockModule('../../src/modules/expiry-intelligence/repositories/recommendation.repository.js', () => ({
  default: mockRecommendationRepository
}));

const { default: expiryService } = await import('../../src/modules/expiry-intelligence/services/expiry.service.js');
const { default: recommendationService } = await import('../../src/modules/expiry-intelligence/services/recommendation.service.js');
const { default: fefoEngine } = await import('../../src/modules/expiry-intelligence/services/fefo_engine.service.js');

describe('Expiry Intelligence Unit Tests', () => {
  const tenantId = 'tenant-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ExpiryService.processExpiryScan', () => {
    it('should update status to EXPIRED if days remaining <= 0', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: tenantId }]);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      
      mockBatchRepository.findAll.mockResolvedValue([
        { id: 'b1', expiryDate: pastDate, medicineId: 'm1' }
      ]);
      mockExpiryAlertRepository.findExistingAlert.mockResolvedValue(null);

      await expiryService.processExpiryScan();

      expect(mockBatchRepository.updateStatus).toHaveBeenCalledWith('b1', 'EXPIRED');
      expect(mockExpiryAlertRepository.createAlert).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'Critical'
      }));
    });
  });

  describe('RecommendationService.generateRecommendations', () => {
    it('should calculate higher priority score for larger quantities', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // 10 days remaining

      mockBatchRepository.getNearExpiry.mockResolvedValue([
        { id: 'b1', batchNumber: 'B1', quantity: 100, expiryDate: futureDate }
      ]);

      await recommendationService.generateRecommendations(tenantId);

      expect(mockRecommendationRepository.upsertRecommendation).toHaveBeenCalledWith(expect.objectContaining({
        priorityScore: 10 // 100 / 10
      }));
    });
  });

  describe('FEFOEngine.selectBatches', () => {
    it('should prioritize earlier expiry', async () => {
      const now = new Date();
      const jan = new Date(now.getFullYear() + 1, 0, 1);
      const mar = new Date(now.getFullYear() + 1, 2, 1);

      mockBatchRepository.findAll.mockResolvedValue([
        { id: 'b1', expiryDate: jan, quantity: 10, batchNumber: 'JAN' },
        { id: 'b2', expiryDate: mar, quantity: 50, batchNumber: 'MAR' }
      ]);

      const result = await fefoEngine.selectBatches(tenantId, 'm1', 15);

      expect(result.selection).toHaveLength(2);
      expect(result.selection[0].batchNumber).toBe('JAN');
      expect(result.selection[1].batchNumber).toBe('MAR');
      expect(result.selection[1].quantity).toBe(5); // 15 - 10
    });
  });
});
