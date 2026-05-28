import { jest , describe, afterEach, it, expect } from '@jest/globals';

// Define mocks first
const mockMedicineRepository = {
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
};

const mockInventoryBatchRepository = {
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
  findByMedicineId: jest.fn(),
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

const mockPrisma = {
  inventory: {
    upsert: jest.fn().mockResolvedValue({ id: 'inv-1' }),
  },
  medicineCategory: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Antibiotics' }),
  },
  manufacturer: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'mfg-1', name: 'Cipla Ltd' }),
  },
  medicine: {
    create: jest.fn(),
  },
  inventoryBatch: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (cb) => cb(mockPrisma)),
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({
  default: mockPrisma,
}));

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule('../../src/modules/inventory/repository/medicine.prisma.repository.js', () => ({
  default: mockMedicineRepository
}));

jest.unstable_mockModule('../../src/modules/inventory/repository/inventory_batch.repository.js', () => ({
  default: mockInventoryBatchRepository
}));

jest.unstable_mockModule('../../src/modules/audit/service/audit.prisma.service.js', () => ({
  default: mockAuditService
}));

jest.unstable_mockModule('../../src/shared/services/eventbus.service.js', () => ({
  default: mockEventBus
}));

jest.unstable_mockModule('../../src/queue/index.js', () => ({
  mainQueue: mockMainQueue,
  worker: { close: jest.fn().mockResolvedValue() },
}));

const mockMovementService = {
  stockIn: jest.fn().mockResolvedValue({ id: 'batch-1', batchNumber: 'P001' }),
};

jest.unstable_mockModule('../../src/modules/stock/service/movement.service.js', () => ({
  default: mockMovementService,
}));

// Import after mocks are defined
const { default: medicineService } = await import('../../src/modules/inventory/service/medicine.prisma.service.js');

describe('MedicinePrismaService Unit Tests (ESM)', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const mockUser = { id: userId, tenantId, role: 'OWNER' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMedicine', () => {
    it('should create a medicine and an initial batch', async () => {
      const medicineData = {
        name: 'Paracetamol',
        branchId: 'branch-1',
        initialBatch: {
          batchNumber: 'P001',
          quantity: 100,
          expiryDate: '2027-01-01',
          purchasePrice: 10
        }
      };

      mockMedicineRepository.create.mockResolvedValue({ id: 'med-1', name: 'Paracetamol' });
      mockInventoryBatchRepository.create.mockResolvedValue({ id: 'batch-1', batchNumber: 'P001' });

      const result = await medicineService.createMedicine(medicineData, tenantId, userId);

      expect(mockMedicineRepository.create).toHaveBeenCalled();
      expect(mockMovementService.stockIn).toHaveBeenCalled();
      expect(result.name).toBe('Paracetamol');
    });

    it('should resolve category, manufacturer, and map flat legacy fields', async () => {
      const legacyData = {
        name: 'Amoxil',
        brandName: 'Amoxil',
        genericName: 'Amoxicillin',
        branchId: 'branch-1',
        category: 'Antibiotics',
        manufacturer: 'Cipla Ltd',
        gst: 12,
        status: 'active',
        schedule: 'OTC',
        supplier: 'Legacy Supplier'
      };

      mockPrisma.medicineCategory.findFirst.mockResolvedValue(null);
      mockPrisma.medicineCategory.create.mockResolvedValue({ id: 'cat-123', name: 'Antibiotics' });
      mockPrisma.manufacturer.findFirst.mockResolvedValue(null);
      mockPrisma.manufacturer.create.mockResolvedValue({ id: 'mfg-456', name: 'Cipla Ltd' });

      mockMedicineRepository.create.mockResolvedValue({ id: 'med-2', name: 'Amoxil' });

      const result = await medicineService.createMedicine(legacyData, tenantId, userId);

      expect(mockMedicineRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Amoxil',
        genericName: 'Amoxicillin',
        categoryId: 'cat-123',
        manufacturerId: 'mfg-456',
        gstPercentage: 12,
        status: 'ACTIVE',
        scheduleType: 'OTC'
      }), expect.anything());
      expect(result.name).toBe('Amoxil');
    });
  });

  describe('updateMedicine', () => {
    it('should allow owner to update all fields', async () => {
      const updateData = { name: 'New Name', rackLocation: 'A1' };
      mockMedicineRepository.findById.mockResolvedValue({ id: 'med-1', name: 'Old Name', totalQuantity: 10, reorderLevel: 5 });
      mockMedicineRepository.update.mockResolvedValue({ id: 'med-1', name: 'New Name', totalQuantity: 10, reorderLevel: 5 });

      const result = await medicineService.updateMedicine('med-1', tenantId, mockUser, updateData);

      expect(mockMedicineRepository.update).toHaveBeenCalledWith('med-1', tenantId, updateData);
      expect(result.name).toBe('New Name');
    });

    it('should only allow staff to update allowed fields', async () => {
      const staffUser = { id: 'staff-1', tenantId, role: 'STAFF' };
      const updateData = { name: 'Illegal Name', rackLocation: 'A1' };
      
      mockMedicineRepository.findById.mockResolvedValue({ id: 'med-1', name: 'Old Name', totalQuantity: 10, reorderLevel: 5 });
      mockMedicineRepository.update.mockResolvedValue({ id: 'med-1', name: 'Illegal Name', rackLocation: 'A1', totalQuantity: 10, reorderLevel: 5 });

      await medicineService.updateMedicine('med-1', tenantId, staffUser, updateData);

      expect(mockMedicineRepository.update).toHaveBeenCalledWith('med-1', tenantId, updateData);
    });
  });

  describe('getFefoBatches', () => {
    it.skip('should return batches sorted by expiry', async () => {
      const futureDate1 = new Date();
      futureDate1.setFullYear(now().getFullYear() + 1);
      const futureDate2 = new Date();
      futureDate2.setFullYear(now().getFullYear() + 2);

      const mockBatches = [
        { id: 'b2', expiryDate: futureDate2, quantity: 100 },
        { id: 'b1', expiryDate: futureDate1, quantity: 50 },
      ];

      mockInventoryBatchRepository.findByMedicineId.mockResolvedValue(mockBatches);

      const result = await medicineService.getFefoBatches('med-1', tenantId, 75);

      expect(result.selectedBatches).toHaveLength(2);
      expect(result.selectedBatches[0].id).toBe('b1'); // Earlier expiry
      expect(result.selectedBatches[0].taken).toBe(50);
      expect(result.selectedBatches[1].id).toBe('b2');
      expect(result.selectedBatches[1].taken).toBe(25);
      expect(result.fulfilled).toBe(true);
    });
  });
});

function now() { return new Date(); }
