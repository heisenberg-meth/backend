import prisma from '../../../config/prisma.js';

class LedgerRepository {
  async createTransaction(data, tx) {
    const client = tx || prisma;
    return client.stockMovement.create({
      data: {
        tenantId: data.tenantId,
        medicineId: data.medicineId,
        batchId: data.batchId,
        branchId: data.branchId,
        movementType: data.type || data.movementType,
        quantity: data.quantity,
        quantityBefore: data.previousStock ?? data.quantityBefore,
        quantityAfter: data.newStock ?? data.quantityAfter,
        performedBy: data.createdBy || data.performedBy,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
      },
      include: {
        medicine: true,
        batch: true,
      },
    });
  }

  async findHistory(tenantId, medicineId, skip = 0, take = 20) {
    return prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(medicineId && { medicineId }),
      },
      include: {
        medicine: true,
        batch: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async countHistory(tenantId, medicineId) {
    return prisma.stockMovement.count({
      where: {
        tenantId,
        ...(medicineId && { medicineId }),
      },
    });
  }
}

export default new LedgerRepository();
