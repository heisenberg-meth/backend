import prisma from "../../../config/prisma.js";

class BatchRepository {
  async findAll(tenantId, filters = {}) {
    const { status, medicineId, minQty } = filters;
    return prisma.inventoryBatch.findMany({
      where: {
        medicine: {
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        ...(status && { status }),
        ...(medicineId && { medicineId }),
        ...(minQty !== undefined && { quantity: { gte: minQty } }),
        deletedAt: null,
      },
      include: { medicine: true, supplier: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.inventoryBatch.findFirst({
      where: {
        id,
        medicine: {
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        deletedAt: null,
      },
      include: { medicine: true },
    });
  }

  async updateStatus(id, status) {
    return prisma.inventoryBatch.update({
      where: { id },
      data: { status },
    });
  }

  async getNearExpiry(tenantId, days) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    return prisma.inventoryBatch.findMany({
      where: {
        medicine: {
          tenantId,
          deletedAt: null,
          isActive: true,
        },
        expiryDate: { lte: thresholdDate },
        status: { notIn: ['EXPIRED', 'QUARANTINED'] },
        quantity: { gt: 0 },
        deletedAt: null,
      },
      include: { medicine: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async quarantineBatch(batchId, reason, userId) {
    return prisma.$transaction([
      prisma.inventoryBatch.update({
        where: { id: batchId },
        data: { status: 'QUARANTINED' },
      }),
      prisma.quarantinedBatch.create({
        data: {
          batchId,
          reason,
          quarantinedBy: userId,
        },
      }),
    ]);
  }
}

export default new BatchRepository();
