import logger from '../../../shared/utils/logger.js';
import crypto from 'crypto';

class MovementService {
  /**
   * Record a stock movement and update batch/inventory aggregates.
   * MUST be run within a Prisma transaction 'tx'.
   * 
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Movement data
   */
  async recordMovement(tx, data) {
    const {
      tenantId,
      medicineId,
      batchId,
      branchId,
      quantity,
      movementType,
      referenceType,
      referenceId,
      idempotencyKey,
      userId,
      notes
    } = data;

    // 1. Validation
    if (!tenantId || !medicineId || !batchId || quantity === undefined) {
      throw new Error('[MOVEMENT_SERVICE] Missing required movement data');
    }

    // 2. Idempotency Check
    const finalIdempotencyKey = idempotencyKey || crypto.randomUUID();
    const existing = await tx.stockMovement.findUnique({
      where: { idempotencyKey: finalIdempotencyKey }
    });
    if (existing) {
      logger.info({ idempotencyKey: finalIdempotencyKey }, '[MOVEMENT_SERVICE] Duplicate movement ignored');
      return existing;
    }

    // 3. Update InventoryBatch quantity
    const batchUpdateData = {
      quantity: { increment: quantity }
    };

    if (data.isFromReservation) {
      batchUpdateData.reservedQuantity = { increment: quantity }; // quantity is negative, so this decrements
    } else {
      batchUpdateData.availableQuantity = { increment: quantity };
    }

    const updatedBatch = await tx.inventoryBatch.update({
      where: {
        id: batchId,
        tenantId 
      },
      data: batchUpdateData
    });

    // 4. Update Inventory (Medicine-level aggregate)
    // Using upsert or update? The plan says "Updates Inventory aggregate". 
    // Usually Inventory record should exist if batch exists, but let's be safe.
    const inventoryUpdateData = {
      currentStock: { increment: quantity }
    };

    if (data.isFromReservation) {
      inventoryUpdateData.reservedStock = { increment: quantity }; // quantity is negative, so this decrements
    }

    const updatedInventory = await tx.inventory.update({
      where: {
        tenantId_branchId_medicineId: {
          tenantId,
          branchId: branchId || null,
          medicineId
        }
      },
      data: inventoryUpdateData
    }).catch(err => {
      logger.error({ err, medicineId, branchId }, '[MOVEMENT_SERVICE] Failed to update inventory aggregate');
      // If inventory record doesn't exist, we might need to create it, but in this system
      // inventory should be initialized when medicine is added to a branch.
      throw err;
    });

    // 4.5 Dynamic Reorder Point Implementation
    let newStatus = 'HEALTHY';
    if (updatedInventory.currentStock <= 0) {
      newStatus = 'OUT_OF_STOCK';
    } else if (updatedInventory.currentStock <= updatedInventory.minimumStock) {
      newStatus = 'CRITICAL';
    } else if (updatedInventory.currentStock <= updatedInventory.reorderPoint) {
      newStatus = 'LOW';
    }

    if (newStatus !== updatedInventory.status) {
      await tx.inventory.update({
        where: { id: updatedInventory.id },
        data: { status: newStatus }
      });
    }

    if (newStatus === 'LOW' || newStatus === 'CRITICAL') {
      logger.warn(
        { medicineId, branchId, currentStock: updatedInventory.currentStock, reorderPoint: updatedInventory.reorderPoint, status: newStatus },
        '[MOVEMENT_SERVICE] Stock level fell below reorder point'
      );
    }

    // 5. Create StockMovement (Ledger Record)
    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        branchId,
        medicineId,
        batchId,
        movementType,
        quantity,
        quantityAfter: updatedBatch.quantity,
        referenceType,
        referenceId,
        idempotencyKey: finalIdempotencyKey,
        performedBy: userId,
        notes
      }
    });

    return movement;
  }

  /**
   * Adjust stock manually with notes and attribution.
   * MUST be run within a Prisma transaction 'tx'.
   * 
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Adjustment data
   */
  async adjustStock(tx, data) {
    const { userId, notes } = data;
    
    if (!userId) {
      throw new Error('[MOVEMENT_SERVICE] userId is required for stock adjustments');
    }
    
    if (!notes) {
      throw new Error('[MOVEMENT_SERVICE] notes are required for stock adjustments');
    }

    return this.recordMovement(tx, {
      ...data,
      movementType: 'ADJUSTMENT',
      referenceType: 'ADJUSTMENT_LOG'
    });
  }

  /**
   * Transfer stock between branches.
   * MUST be run within a Prisma transaction 'tx'.
   * 
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Transfer data (sourceBranchId, destinationBranchId, quantity, etc.)
   */
  async transferStock(tx, data) {
    const { tenantId, medicineId, batchId, sourceBranchId, destinationBranchId, quantity, userId, notes } = data;

    if (!sourceBranchId || !destinationBranchId) {
      throw new Error('[MOVEMENT_SERVICE] Both source and destination branch IDs are required for transfer');
    }

    if (quantity <= 0) {
      throw new Error('[MOVEMENT_SERVICE] Transfer quantity must be greater than zero');
    }

    const transferGroupId = crypto.randomUUID(); // Group transfers together

    // 1. Transfer OUT from source branch
    const transferOut = await this.recordMovement(tx, {
      tenantId,
      medicineId,
      batchId,
      branchId: sourceBranchId,
      quantity: -quantity,
      movementType: 'TRANSFER_OUT',
      referenceType: 'TRANSFER_GROUP',
      referenceId: transferGroupId,
      userId,
      notes: notes || `Transfer to branch ${destinationBranchId}`
    });

    // 2. Transfer IN to destination branch
    const transferIn = await this.recordMovement(tx, {
      tenantId,
      medicineId,
      batchId,
      branchId: destinationBranchId,
      quantity: quantity,
      movementType: 'TRANSFER_IN',
      referenceType: 'TRANSFER_GROUP',
      referenceId: transferGroupId,
      userId,
      notes: notes || `Transfer from branch ${sourceBranchId}`
    });

    return { transferOut, transferIn, transferGroupId };
  }
}

export default new MovementService();
