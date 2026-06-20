import { jest, describe, afterEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const medicineRepositoryPath = path.resolve(__dirname, '../repositories/medicine.repository.js');
const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const auditServicePath = path.resolve(__dirname, '../../audit/service/audit.prisma.service.js');
const eventBusPath = path.resolve(__dirname, '../../../shared/services/eventbus.service.js');
const mainQueuePath = path.resolve(__dirname, '../../../queue/index.js');
const movementServicePath = path.resolve(__dirname, '../../stock/service/movement.service.js');
const scanKeysPath = path.resolve(__dirname, '../../../shared/utils/scan-keys.js');
const medicineServicePath = path.resolve(__dirname, '../services/medicine.service.js');

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

const mockScanKeys = jest.fn().mockResolvedValue([]);

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(medicineRepositoryPath, () => ({
  default: mockMedicineRepository,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedis,
}));

jest.unstable_mockModule(auditServicePath, () => ({
  default: mockAuditService,
}));

jest.unstable_mockModule(eventBusPath, () => ({
  default: mockEventBus,
}));

jest.unstable_mockModule(mainQueuePath, () => ({
  mainQueue: mockMainQueue,
}));

jest.unstable_mockModule(movementServicePath, () => ({
  default: mockMovementService,
}));

jest.unstable_mockModule(scanKeysPath, () => ({
  scanKeys: mockScanKeys,
}));

// Import after mocks are defined
const { default: medicineService } = await import(medicineServicePath);

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
          sellingPrice: 12,
          mrp: 15,
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
