import medicineService from '../services/medicine.service.js';
import prisma from '../../../config/prisma.js';
import { describe,beforeAll, afterAll, it, expect } from '@jest/globals';

describe('Medicine Status History', () => {
  let tenantId;
  let branchId;
  let userId;
  let medicine;

  beforeAll(async () => {
    // Setup tenant and user
    const tenant = await prisma.tenant.create({
      data: { name: 'Test Tenant Status', email: 'test-status@example.com' }
    });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: {
        name: 'Test Branch',
        code: 'BR001',
        tenantId
      }
    });
    branchId = branch.id;

    const user = await prisma.user.create({
      data: {
        email: 'test-status@example.com',
        fullName: 'Test User Status',
        password: 'hashed_password',
        tenantId: tenantId,
        branchId,
        role: 'OWNER'
      }
    });
    userId = user.id;

    // Create a medicine
    medicine = await medicineService.createMedicineMaster(tenantId, userId, {
      name: 'Status Test Med',
      barcode: 'STATUS001',
      sku: 'SKU-STATUS-001',
      status: 'ACTIVE',
      branchId
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
      statusReason: 'Testing history'
    });

    const history = await prisma.medicineStatusHistory.findFirst({
      where: { medicineId: medicine.id, newStatus: 'BLOCKED' }
    });

    expect(history).toBeDefined();
    expect(history.oldStatus).toBe('ACTIVE');
    expect(history.newStatus).toBe('BLOCKED');
    expect(history.reason).toBe('Testing history');
    expect(history.changedBy).toBe(userId);
  });

  it('should record history when deactivated', async () => {
    await medicineService.deactivateMedicine(medicine.id, tenantId, userId);

    const history = await prisma.medicineStatusHistory.findFirst({
      where: { medicineId: medicine.id, newStatus: 'INACTIVE', reason: 'Medicine deactivation' }
    });

    expect(history).toBeDefined();
    expect(history.newStatus).toBe('INACTIVE');
    expect(history.changedBy).toBe(userId);
  });
});
