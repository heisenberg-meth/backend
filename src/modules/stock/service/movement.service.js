import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import stockRepository from '../repositories/stock.repository.js';
import ledgerRepository from '../repositories/ledger.repository.js';
import cacheInvalidatorService from '../../inventory/service/cache-invalidator.service.js';

class MovementService {
  async stockOut(tenantId, { medicineId, quantity, type, branchId, batchId }, userId) {
    const result = await prisma.$transaction(async (tx) => {
      const whereClause = {
        medicineId,
        quantity: { gt: 0 },
        deletedAt: null,
      };
      if (batchId) {
        whereClause.id = batchId;
      } else {
        whereClause.branchId = branchId;
        whereClause.status = 'ACTIVE';
      }

      const batches = await tx.inventoryBatch.findMany({
        where: whereClause,
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
      const targetBranchId = branchId || batches[0]?.branchId;

      await ledgerRepository.createTransaction(
        {
          tenantId,
          medicineId,
          batchId: deductions[0]?.batchId,
          branchId: targetBranchId,
          type: type || 'SALE',
          quantity: totalDeducted,
          previousStock: batches.reduce((s, b) => s + b.quantity, 0),
          newStock: batches.reduce((s, b) => s + b.quantity, 0) - totalDeducted,
          createdBy: userId,
        },
        tx,
      );

      if (targetBranchId) {
        const existingInventory = await tx.inventory.findFirst({
          where: {
            tenantId,
            branchId: targetBranchId,
            medicineId,
          },
        });
        if (existingInventory) {
          await tx.inventory.update({
            where: { id: existingInventory.id },
            data: {
              currentStock: { decrement: totalDeducted },
            },
          });
        }
      }

      logger.info({ tenantId, medicineId, quantity: totalDeducted, type }, 'Stock out completed');

      return { totalDeducted, batches: deductions };
    });

    await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineId);
    return result;
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
          ...(data.referenceType === 'PURCHASE' &&
            data.referenceId && { purchaseInvoiceId: data.referenceId }),
        },
      });

      await ledgerRepository.createTransaction(
        {
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
        },
        client,
      );

      await client.inventory.upsert({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: data.branchId,
            medicineId: data.medicineId,
          },
        },
        update: {
          currentStock: { increment: data.quantity },
        },
        create: {
          tenantId,
          branchId: data.branchId,
          medicineId: data.medicineId,
          currentStock: data.quantity,
          reorderPoint: 10,
        },
      });

      logger.info(
        { tenantId, medicineId: data.medicineId, quantity: data.quantity, batchId: newBatch.id },
        'Stock in completed',
      );

      return newBatch;
    };

    const result = tx ? await run(tx) : await prisma.$transaction(run);
    if (!tx) {
      await cacheInvalidatorService.invalidateInventoryCaches(tenantId, data.medicineId);
    }
    return result;
  }

  async recordMovement(tenantId, data, userId, tx) {
    const {
      medicineId,
      batchId,
      branchId,
      movementType,
      quantity,
      referenceType,
      referenceId,
      idempotencyKey,
      notes,
    } = data;

    const execute = async (client) => {
      if (idempotencyKey) {
        const existing = await client.stockMovement.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          logger.info({ idempotencyKey }, '[MOVEMENT_SERVICE] Duplicate movement ignored');
          return existing;
        }
      }

      const lockedBatches = await client.$queryRaw`
        SELECT * FROM "InventoryBatch" WHERE id = ${batchId} FOR UPDATE
      `;

      if (!lockedBatches || lockedBatches.length === 0) {
        throw new Error('Batch not found');
      }

      if (lockedBatches[0].availableQuantity + quantity < 0) {
        throw new Error('Insufficient stock');
      }

      const resolvedBranchId = branchId || lockedBatches[0].branchId || null;

      const updatedBatch = await client.inventoryBatch.update({
        where: { id: batchId },
        data: {
          quantity: { increment: quantity },
          availableQuantity: { increment: quantity },
        },
      });

      await ledgerRepository.createTransaction(
        {
          tenantId,
          medicineId,
          batchId,
          branchId: resolvedBranchId,
          type: movementType,
          quantity: Math.abs(quantity),
          previousStock: updatedBatch.quantity - quantity,
          newStock: updatedBatch.quantity,
          createdBy: userId,
          referenceType,
          referenceId,
          notes,
        },
        client,
      );

      const existingInventory = await client.inventory.findFirst({
        where: {
          tenantId,
          branchId: resolvedBranchId,
          medicineId,
        },
      });

      if (existingInventory) {
        await client.inventory.update({
          where: { id: existingInventory.id },
          data: {
            currentStock: { increment: quantity },
          },
        });
      } else {
        await client.inventory.create({
          data: {
            tenantId,
            branchId: resolvedBranchId,
            medicineId,
            currentStock: quantity,
          },
        });
      }

      logger.info(
        { tenantId, medicineId, batchId, movementType, quantity },
        'Stock movement recorded',
      );
    };

    const result = tx ? await execute(tx) : await prisma.$transaction(execute);
    if (!tx) {
      await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineId);
    }
    return result;
  }
}

export default new MovementService();
