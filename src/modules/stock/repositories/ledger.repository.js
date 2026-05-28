import prisma from "../../../config/prisma.js";

class LedgerRepository {
  async createTransaction(data, tx) {
    const client = tx || prisma;
    return client.stockTransaction.create({
      data,
      include: {
        medicine: true,
        batch: true,
      },
    });
  }

  async findHistory(tenantId, medicineId, skip = 0, take = 20) {
    return prisma.stockTransaction.findMany({
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
    return prisma.stockTransaction.count({
      where: {
        tenantId,
        ...(medicineId && { medicineId }),
      },
    });
  }
}

export default new LedgerRepository();
