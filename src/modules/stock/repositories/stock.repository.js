import prisma from '../../../config/prisma.js';
import inventoryCalculationService from '../../inventory/service/inventory-calculation.service.js';

class StockRepository {
  async getCurrentStock(tenantId, medicineId, client) {
    const db = client || prisma;
    const batches = await db.inventoryBatch.findMany({
      where: {
        medicineId,
        medicine: { tenantId },
        deletedAt: null,
        quantity: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const totalQuantity = inventoryCalculationService.calculateAvailableStock(batches);
    return { totalQuantity, batches };
  }

  async findBatchById(batchId, tenantId) {
    return prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        medicine: { tenantId },
        deletedAt: null,
      },
      include: { medicine: true },
    });
  }

  async updateBatchQuantity(batchId, newQuantity, tx) {
    const client = tx || prisma;
    return client.inventoryBatch.update({
      where: { id: batchId },
      data: { quantity: newQuantity },
    });
  }

  async createDamagedRecord(data, tx) {
    const client = tx || prisma;
    return client.damagedStock.create({
      data,
    });
  }

  async getDamagedHistory(tenantId, skip = 0, take = 20) {
    return prisma.damagedStock.findMany({
      where: { tenantId },
      include: {
        batch: {
          include: { medicine: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async createSnapshot(data) {
    return prisma.stockSnapshot.upsert({
      where: {
        tenantId_medicineId_snapshotDate: {
          tenantId: data.tenantId,
          medicineId: data.medicineId,
          snapshotDate: data.snapshotDate,
        },
      },
      update: {
        closingStock: data.closingStock,
      },
      create: data,
    });
  }
}

export default new StockRepository();
