import { jest, describe, afterEach, it, expect } from '@jest/globals';

// Define mocks first
const mockMedicineRepository = {
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  findByBarcode: jest.fn(),
  flagBatchRecall: jest.fn(),
  deleteAll: jest.fn(),
  softDelete: jest.fn(),
};

const mockPrisma = {
  medicine: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'med-1', name: 'Test Med' }),
    update: jest.fn(),
  },
  medicineCategory: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Antibiotics' }),
  },
  manufacturer: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'mfg-1', name: 'Cipla Ltd' }),
  },
  inventory: {
    upsert: jest.fn().mockResolvedValue({ id: 'inv-1' }),
  },
  $transaction: jest.fn(async (cb) => {
    // Basic mock transaction that just calls the callback with a prisma-like object
    return await cb({
      medicine: mockPrisma.medicine,
      medicinePricing: { create: jest.fn() },
      inventory: mockPrisma.inventory,
    });
  }),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn(() => []),
  del: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

const mockEventBus = {
  publish: jest.fn(),
};

const mockMainQueue = {
  add: jest.fn(),
};

const mockMovementService = {
  stockIn: jest.fn().mockResolvedValue({ id: 'batch-1', batchNumber: 'P001' }),
};

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule('../../../config/prisma.js', () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule('../repositories/medicine.repository.js', () => ({
  default: mockMedicineRepository,
}));

jest.unstable_mockModule('../../../config/redis.js', () => ({
  default: mockRedis,
}));

jest.unstable_mockModule('../../audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule('../../../shared/services/eventbus.service.js', () => ({
  default: mockEventBus,
}));

jest.unstable_mockModule('../../../queue/index.js', () => ({
  mainQueue: mockMainQueue,
}));

jest.unstable_mockModule('../../stock/service/movement.service.js', () => ({
  default: mockMovementService,
}));

// Import after mocks are defined
const { default: medicineService } = await import('../services/medicine.service.js');

describe('MedicineIntelligenceService Consolidation (ESM)', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMedicines', () => {
    it('should use cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockMedicineRepository.findAll.mockResolvedValue({ medicines: [], total: 0 });

      const params = { tenantId, query: { q: 'paracetamol' } };
      await medicineService.getMedicines(params);

      expect(mockMedicineRepository.findAll).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('createMedicineMaster', () => {
    it('should resolve category, manufacturer, and initialize inventory', async () => {
      const data = {
        name: 'Amoxil',
        branchId: 'branch-1',
        category: 'Antibiotics',
        manufacturer: 'Cipla Ltd',
        barcode: '123456789',
        initialBatch: {
          batchNumber: 'P001',
          quantity: 100,
          expiryDate: '2027-01-01',
          purchasePrice: 10,
        },
      };

      mockMedicineRepository.findByBarcode.mockResolvedValue(null);
      mockPrisma.medicine.create.mockResolvedValue({ id: 'med-2', name: 'Amoxil' });

      const result = await medicineService.createMedicineMaster(tenantId, userId, data);

      expect(mockPrisma.medicine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: { connect: { id: 'cat-1' } },
            manufacturer: { connect: { id: 'mfg-1' } },
          }),
        }),
      );
      expect(mockMovementService.stockIn).toHaveBeenCalled();
      expect(result.name).toBe('Amoxil');
    });
  });

  describe('batchRecall', () => {
    it('should call repository', async () => {
      mockMedicineRepository.flagBatchRecall.mockResolvedValue({ count: 1 });
      await medicineService.batchRecall({ batchNumber: 'B123' }, tenantId, userId);
      expect(mockMedicineRepository.flagBatchRecall).toHaveBeenCalledWith('B123', tenantId);
    });
  });
});
