import logger from '../../../shared/utils/logger.js';
import MovementService from './movement.service.js';

class ReservationService {
  /**
   * Reserve stock for a pending transaction.
   * MUST be run within a Prisma transaction 'tx'.
   *
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Reservation data
   */
  async reserveStock(tx, data) {
    const { tenantId, branchId, medicineId, batchId, quantity } = data;

    if (!tenantId || !medicineId || !batchId || !quantity || quantity <= 0) {
      throw new Error('[RESERVATION_SERVICE] Invalid reservation data');
    }

    // 1. Check available quantity
    const batch = await tx.inventoryBatch.findUnique({
      where: { id: batchId, tenantId },
      select: { availableQuantity: true },
    });

    if (!batch) {
      throw new Error(`[RESERVATION_SERVICE] Batch ${batchId} not found`);
    }

    if (batch.availableQuantity < quantity) {
      throw new Error(
        `[RESERVATION_SERVICE] Insufficient available stock in batch ${batchId}. Requested: ${quantity}, Available: ${batch.availableQuantity}`,
      );
    }

    // 2. Update InventoryBatch
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batchId, tenantId },
      data: {
        availableQuantity: { decrement: quantity },
        reservedQuantity: { increment: quantity },
      },
    });

    // 3. Update Inventory
    await tx.inventory
      .update({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: branchId || null,
            medicineId,
          },
        },
        data: {
          reservedStock: { increment: quantity },
        },
      })
      .catch((err) => {
        logger.error(
          { err, medicineId, branchId },
          '[RESERVATION_SERVICE] Failed to update inventory aggregate for reservation',
        );
        throw err;
      });

    return { success: true, reservedQuantity: quantity, batchId: updatedBatch.id };
  }

  /**
   * Release reserved stock back to available pool.
   * MUST be run within a Prisma transaction 'tx'.
   *
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Release data
   */
  async releaseStock(tx, data) {
    const { tenantId, branchId, medicineId, batchId, quantity } = data;

    if (!tenantId || !medicineId || !batchId || !quantity || quantity <= 0) {
      throw new Error('[RESERVATION_SERVICE] Invalid release data');
    }

    // 1. Update InventoryBatch
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batchId, tenantId },
      data: {
        availableQuantity: { increment: quantity },
        reservedQuantity: { decrement: quantity },
      },
    });

    // 2. Update Inventory
    await tx.inventory
      .update({
        where: {
          tenantId_branchId_medicineId: {
            tenantId,
            branchId: branchId || null,
            medicineId,
          },
        },
        data: {
          reservedStock: { decrement: quantity },
        },
      })
      .catch((err) => {
        logger.error(
          { err, medicineId, branchId },
          '[RESERVATION_SERVICE] Failed to update inventory aggregate for release',
        );
        throw err;
      });

    return { success: true, releasedQuantity: quantity, batchId: updatedBatch.id };
  }

  /**
   * Commit reserved stock (convert to actual movement out).
   * MUST be run within a Prisma transaction 'tx'.
   *
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Commit data (same as movement data but quantity should be positive, we will convert to negative)
   */
  async commitReservation(tx, data) {
    const { quantity } = data;

    if (!quantity || quantity <= 0) {
      throw new Error('[RESERVATION_SERVICE] Invalid commit quantity');
    }

    // Pass isFromReservation flag so MovementService knows not to touch availableQuantity again,
    // and instead decreases reservedQuantity and reservedStock.
    const movementData = {
      ...data,
      quantity: -quantity, // Movement is going OUT
      isFromReservation: true,
    };

    const movement = await MovementService.recordMovement(tx, movementData);

    return movement;
  }
}

export default new ReservationService();
