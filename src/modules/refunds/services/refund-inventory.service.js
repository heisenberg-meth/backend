import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

class RefundInventoryService {
  async restoreStock(tenantId, returnId, items, tx) {
    const client = tx || prisma;
    const movements = [];

    for (const item of items) {
      const batch = await client.inventoryBatch.findUnique({
        where: { id: item.batchId },
      });

      if (!batch) {
        logger.warn(
          `[Refund Inventory] Batch ${item.batchId} not found, skipping stock restoration`,
        );
        continue;
      }

      await client.inventoryBatch.update({
        where: { id: item.batchId },
        data: {
          quantity: { increment: item.returnedQuantity },
          availableQuantity: { increment: item.returnedQuantity },
        },
      });

      await client.inventory.update({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: batch.branchId,
            medicineId: item.medicineId,
          },
        },
        data: {
          currentStock: { increment: item.returnedQuantity },
        },
      });

      const movement = await client.stockMovement.create({
        data: {
          tenantId,
          branchId: item.branchId || batch.branchId,
          medicineId: item.medicineId,
          batchId: item.batchId,
          movementType: 'RETURN',
          quantity: item.returnedQuantity,
          referenceType: 'RETURN',
          referenceId: returnId,
          notes: `Restored from refund ${returnId}`,
        },
      });

      movements.push(movement);

      await client.returnItem.update({
        where: { id: item.id },
        data: { disposition: 'RESTOCK' },
      });
    }

    emitLocalEvent(EVENTS.INVENTORY_REVERSED, {
      tenantId,
      returnId,
      itemsRestored: movements.length,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Refund Inventory] Restored ${movements.length} items for refund ${returnId}`);
    return movements;
  }
}

export default new RefundInventoryService();
