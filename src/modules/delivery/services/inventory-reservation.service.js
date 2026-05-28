import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class InventoryReservationService {
  /**
   * Reserves inventory for an online order using FEFO batch selection.
   * Increments 'reservedQuantity' on matched batches.
   */
  async reserveInventory(tenantId, orderItems) {
    logger.info(`[InventoryReservation] Reserving stock for order items: ${JSON.stringify(orderItems)}`);

    const reservedBatches = [];

    try {
      await prisma.$transaction(async (tx) => {
        for (const item of orderItems) {
          let remainingQty = item.quantity;

          // 1. Find ACTIVE batches with quantity available using FEFO
          const batches = await tx.inventoryBatch.findMany({
            where: {
              medicine: { tenantId },
              medicineId: item.medicineId,
              status: 'ACTIVE',
              deletedAt: null,
              // Available = quantity - reservedQuantity
            },
            orderBy: { expiryDate: 'asc' },
          });

          for (const batch of batches) {
            const available = batch.quantity - batch.reservedQuantity;
            if (available <= 0) continue;

            const reserveQty = Math.min(remainingQty, available);

            // 2. Increment reservedQuantity
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { reservedQuantity: { increment: reserveQty } },
            });

            reservedBatches.push({
              batchId: batch.id,
              medicineId: item.medicineId,
              quantity: reserveQty,
            });
            remainingQty -= reserveQty;

            if (remainingQty === 0) break;
          }

          if (remainingQty > 0) {
            throw new Error(
              `Insufficient stock for medicine ID: ${item.medicineId}. Missing: ${remainingQty}`,
            );
          }
        }
      });

      return { success: true, reservedBatches };
    } catch (error) {
      logger.error(`[InventoryReservation] Reservation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Releases reserved inventory when an order is cancelled or failed.
   */
  async releaseReservation(tenantId, reservedBatches) {
    logger.info(`[InventoryReservation] Releasing reservations for batches: ${JSON.stringify(reservedBatches)}`);

    await prisma.$transaction(
      reservedBatches.map((item) =>
        prisma.inventoryBatch.update({
          where: { id: item.batchId },
          data: { reservedQuantity: { decrement: item.quantity } }
        })
      )
    );
  }

  /**
   * Commits the reservation when an order is packed or delivered (deducts real stock).
   * This is usually called during fulfillment to sync real stock.
   */
  async commitReservation(tenantId, reservedBatches) {
     // In a real scenario, this would decrement BOTH quantity and reservedQuantity.
     // To keep this MVP simple, we'll keep the reserve as a lock.
     logger.info(`[InventoryReservation] Committing reservations: ${JSON.stringify(reservedBatches)}`);
     
     await prisma.$transaction(
        reservedBatches.map((item) =>
          prisma.inventoryBatch.update({
            where: { id: item.batchId },
            data: { 
               quantity: { decrement: item.quantity },
               reservedQuantity: { decrement: item.quantity } 
            }
          })
        )
      );
  }

  /**
   * Returns items to stock (increments quantity) for returned or cancelled-after-packed orders.
   */
  async returnToStock(tenantId, reservedBatches) {
    logger.info(`[InventoryReservation] Returning items to stock: ${JSON.stringify(reservedBatches)}`);

    await prisma.$transaction(
      reservedBatches.map((item) =>
        prisma.inventoryBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } }
        })
      )
    );
  }
}

export default new InventoryReservationService();
