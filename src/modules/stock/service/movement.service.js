import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import stockRepository from '../repositories/stock.repository.js';
import ledgerRepository from '../repositories/ledger.repository.js';

class MovementService {
  async stockOut(tenantId, { medicineId, quantity, type, branchId }, userId) {
    return prisma.$transaction(async (tx) => {
      const batches = await tx.inventoryBatch.findMany({
        where: {
          medicineId,
          branchId,
          status: 'ACTIVE',
          quantity: { gt: 0 },
          deletedAt: null,
        },
        orderBy: { expiryDate: 'asc' },
      });

      let remaining = quantity;
      const deductions = [];

      for (const batch of batches) {
        if (remaining <= 0) break;

        const take = Math.min(remaining, batch.quantity);
        remaining -= take;

        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantity: batch.quantity - take,
            availableQuantity: batch.availableQuantity - take,
          },
        });

        deductions.push({ batchId: batch.id, quantity: take });
      }

      if (remaining > 0) {
        throw new Error('Insufficient stock');
      }

      const totalDeducted = quantity - remaining;

      await ledgerRepository.createTransaction({
        tenantId,
        medicineId,
        batchId: deductions[0]?.batchId,
        branchId,
        type: type || 'SALE',
        quantity: totalDeducted,
        previousStock: batches.reduce((s, b) => s + b.quantity, 0),
        newStock: batches.reduce((s, b) => s + b.quantity, 0) - totalDeducted,
        createdBy: userId,
      }, tx);

      logger.info({ tenantId, medicineId, quantity: totalDeducted, type }, 'Stock out completed');

      return { totalDeducted, batches: deductions };
    });
  }

  async stockIn(tenantId, data, userId, tx) {
    const run = async (client) => {
      const currentStock = await stockRepository.getCurrentStock(tenantId, data.medicineId, client);

      const newBatch = await client.inventoryBatch.create({
        data: {
          tenantId,
          medicineId: data.medicineId,
          branchId: data.branchId,
          batchNumber: data.batchNumber,
          quantity: data.quantity,
          receivedQuantity: data.quantity,
          availableQuantity: data.quantity,
          expiryDate: new Date(data.expiryDate),
          purchasePrice: data.purchasePrice || 0,
          sellingPrice: data.sellingPrice || 0,
          mrp: data.mrp || data.sellingPrice || 0,
          status: 'ACTIVE',
        },
      });

      await ledgerRepository.createTransaction({
        tenantId,
        medicineId: data.medicineId,
        batchId: newBatch.id,
        branchId: data.branchId,
        type: 'STOCK_IN',
        quantity: data.quantity,
        previousStock: currentStock.totalQuantity,
        newStock: currentStock.totalQuantity + data.quantity,
        createdBy: userId,
        referenceType: data.referenceType,
        notes: data.notes,
      }, client);

      logger.info({ tenantId, medicineId: data.medicineId, quantity: data.quantity, batchId: newBatch.id }, 'Stock in completed');

      return newBatch;
    };

    if (tx) return run(tx);
    return prisma.$transaction(run);
  }
}

export default new MovementService();
