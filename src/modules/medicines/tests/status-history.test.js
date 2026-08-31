import { jest, describe, beforeAll, afterAll, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const auditPath = path.resolve(__dirname, '../../audit/service/audit.prisma.service.js');
const eventbusPath = path.resolve(__dirname, '../../../shared/services/eventbus.service.js');
const queuePath = path.resolve(__dirname, '../../../queue/index.js');
const movementPath = path.resolve(__dirname, '../../stock/service/movement.service.js');

// Status history in-memory store for verification
const statusHistories = [];

const mockPrisma = {
  tenant: {
    create: jest.fn().mockResolvedValue({
      id: 'tenant-1',
      name: 'Test Tenant Status',
      email: 'test-status@example.com',
    }),
    delete: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  },
  branch: {
    create: jest.fn().mockResolvedValue({ id: 'branch-1', name: 'Test Branch', code: 'BR001' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  user: {
    create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test-status@example.com' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    findFirst: jest.fn().mockImplementation(({ where }) => {
      if (where && (where.id || where.id === 'med-1')) {
        return Promise.resolve({
          id: 'med-1',
          name: 'Status Test Med',
          status: 'ACTIVE',
          isActive: true,
          tenantId: where.tenantId || 'tenant-1',
        });
      }
      return Promise.resolve(null);
    }),
    findUnique: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'med-1', name: 'Status Test Med', status: 'ACTIVE' }),
    update: jest
      .fn()
      .mockResolvedValue({ id: 'med-1', name: 'Status Test Med', status: 'BLOCKED' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  inventory: {
    upsert: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  inventoryBatch: {
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  medicineStatusHistory: {
    create: jest.fn().mockImplementation(({ data }) => {
      const entry = {
        id: `hist-${statusHistories.length + 1}`,
        medicineId: data.medicine.connect.id,
        oldStatus: data.oldStatus,
        newStatus: data.newStatus,
        reason: data.reason,
        changedBy: data.changedByUser.connect.id,
      };
      statusHistories.push(entry);
      return Promise.resolve(entry);
    }),
    findFirst: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        statusHistories.find(
          (h) =>
            h.medicineId === where.medicineId &&
            h.newStatus === where.newStatus &&
            (!where.reason || h.reason === where.reason),
        ) || null,
      );
    }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  $transaction: jest.fn(async (cb) => {
    return await cb(mockPrisma);
  }),
};

// Apply Jest mocks
jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(redisPath, () => ({
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    keys: jest.fn(() => []),
    del: jest.fn(),
  },
}));

jest.unstable_mockModule(auditPath, () => ({
  default: {
    log: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule(eventbusPath, () => ({
  default: {
    publish: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule(queuePath, () => ({
  mainQueue: {
    add: jest.fn().mockResolvedValue(true),
  },
}));

jest.unstable_mockModule(movementPath, () => ({
  default: {
    stockIn: jest.fn().mockResolvedValue({ id: 'batch-1' }),
    stockOut: jest.fn().mockResolvedValue({ id: 'batch-2' }),
  },
}));

// Dynamic imports
const [{ default: medicineService }, { default: prisma }] = await Promise.all([
  import('../services/medicine.service.js'),
  import('../../../config/prisma.js'),
]);

describe('Medicine Status History', () => {
  let tenantId;
  let branchId;
  let userId;
  let medicine;

  beforeAll(async () => {
    // Setup tenant and user
    const tenant = await prisma.tenant.create({
      data: { name: 'Test Tenant Status', email: 'test-status@example.com' },
    });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: {
        name: 'Test Branch',
        code: 'BR001',
        tenantId,
      },
    });
    branchId = branch.id;

    const user = await prisma.user.create({
      data: {
        email: 'test-status@example.com',
        fullName: 'Test User Status',
        password: 'hashed_password',
        tenantId: tenantId,
        branchId,
        role: 'OWNER',
      },
    });
    userId = user.id;

    // Mock findById for medicine lookup
    const mockMedRecord = {
      id: 'med-1',
      name: 'Status Test Med',
      barcode: 'STATUS001',
      sku: 'SKU-STATUS-001',
      status: 'ACTIVE',
      branchId,
      tenantId,
    };
    mockPrisma.medicine.findUnique = jest.fn().mockResolvedValue(mockMedRecord);

    // Create a medicine
    medicine = await medicineService.createMedicineMaster(tenantId, userId, {
      name: 'Status Test Med',
      barcode: 'STATUS001',
      sku: 'SKU-STATUS-001',
      status: 'ACTIVE',
      branchId,
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.medicineStatusHistory.deleteMany({ where: { tenantId } });
    await prisma.inventory.deleteMany({ where: { tenantId } });
    await prisma.inventoryBatch.deleteMany({ where: { tenantId } });
    await prisma.medicine.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  });

  it('should record history when status is updated', async () => {
    await medicineService.updateMedicineMaster(medicine.id, tenantId, userId, 'OWNER', {
      status: 'BLOCKED',
      statusReason: 'Testing history',
    });

    const history = await prisma.medicineStatusHistory.findFirst({
      where: { medicineId: medicine.id, newStatus: 'BLOCKED' },
    });

    expect(history).toBeDefined();
    expect(history.oldStatus).toBe('ACTIVE');
    expect(history.newStatus).toBe('BLOCKED');
    expect(history.reason).toBe('Testing history');
    expect(history.changedBy).toBe(userId);
  });

  it('should record history when deactivated', async () => {
    // Mock findUnique to return the correct current status before deactivation
    mockPrisma.medicine.findUnique = jest.fn().mockResolvedValue({
      id: medicine.id,
      name: 'Status Test Med',
      status: 'BLOCKED',
      tenantId,
    });

    await medicineService.deactivateMedicine(medicine.id, tenantId, userId);

    const history = await prisma.medicineStatusHistory.findFirst({
      where: { medicineId: medicine.id, newStatus: 'INACTIVE', reason: 'Medicine deactivation' },
    });

    expect(history).toBeDefined();
    expect(history.newStatus).toBe('INACTIVE');
    expect(history.changedBy).toBe(userId);
  });
});
