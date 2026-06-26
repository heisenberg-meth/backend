import prisma from '../../../config/prisma.js';

class InventoryBatchRepository {
  async findByMedicineId(medicineId, branchId = null) {
    return prisma.inventoryBatch.findMany({
      where: { medicineId, branchId, deletedAt: null },
      orderBy: { expiryDate: 'asc' }, // FEFO by default
    });
  }

  async findById(id) {
    return prisma.inventoryBatch.findFirst({
      where: { id, deletedAt: null },
      include: { medicine: true },
    });
  }

  async create(data, options = {}) {
    return prisma.inventoryBatch.create({
      data,
      ...options,
    });
  }

  async update(id, data, options = {}) {
    return prisma.inventoryBatch.update({
      where: { id },
      data,
      ...options,
    });
  }

  async delete(id, options = {}) {
    const { select } = options;
    return prisma.inventoryBatch.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
      ...(select ? { select } : { select: { id: true } }),
    });
  }

  async getNearExpiry(tenantId, days, branchId = null) {
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    const where = {
      tenantId,
      availableQuantity: { gt: 0 },
      deletedAt: null,
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (days === 0) {
      where.OR = [{ expiryDate: { lte: thresholdDate } }, { status: 'EXPIRED' }];
    } else {
      where.expiryDate = { gte: now, lte: thresholdDate };
      where.status = { notIn: ['EXPIRED', 'ARCHIVED'] };
    }

    return prisma.inventoryBatch.findMany({
      where: {
        ...where,
        medicine: {
          deletedAt: null,
        },
      },
      include: { medicine: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getLowStock(tenantId, branchId = null) {
    return prisma.inventory
      .findMany({
        where: {
          tenantId,
          branchId,
        },
        include: { medicine: true },
      })
      .then((results) => results.filter((r) => r.currentStock <= r.reorderPoint));
  }
}

export default new InventoryBatchRepository();
