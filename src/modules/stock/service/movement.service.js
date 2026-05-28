import crypto from "crypto";
import prisma from "../../../config/prisma.js";
import inventorySyncService from '../../ecommerce/services/inventory-sync.service.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import alertSettingsService from '../../alert-settings/services/alert-settings.service.js';
import logger from '../../../shared/utils/logger.js';

class MovementService {
  
  async recordMovement(tenantId, data, userId, externalTx) {
    const execute = async (tx) => {
      const {
        medicineId,
        batchId,
        branchId,
        movementType, // PURCHASE, SALE, RETURN, DAMAGE, EXPIRED, TRANSFER_IN, TRANSFER_OUT, ADJUSTMENT
        quantity,     // Positive for IN, Negative for OUT
        referenceType,
        referenceId,
        notes,
        idempotencyKey,
        isReserved    // NEW: Indicates if this OUT movement is fulfilling a reservation
      } = data;

      // 1. Update Inventory Batch (Lot level)
      let batch = null;
      if (batchId) {
        const updateData = {
          quantity: { increment: quantity }
        };

        // Deduction Logic: Available vs Reserved
        if (quantity < 0) {
          if (isReserved) {
            updateData.reservedQuantity = { increment: quantity }; // quantity is negative
          } else {
            updateData.availableQuantity = { increment: quantity };
          }
        } else {
          // Addition Logic: Always goes to available
          updateData.availableQuantity = { increment: quantity };
        }

        batch = await tx.inventoryBatch.update({
          where: { id: batchId },
          data: updateData
        });

        // Lifecycle: Mark as ARCHIVED and RESOLVE alerts if fully depleted
        if (batch.quantity <= 0) {
          batch = await tx.inventoryBatch.update({
            where: { id: batchId },
            data: { status: 'ARCHIVED' }
          });

          // Resolve expiry alerts for this specific batch
          await tx.expiryAlert.updateMany({
            where: { tenantId, batchId, isResolved: false },
            data: { 
              isResolved: true, 
              resolvedAt: new Date(),
              resolutionNote: 'Batch depleted to zero'
            }
          });
        }
        
        if (batch.quantity < 0) {
          throw new Error(`Insufficient physical stock in batch ${batch.batchNumber} for medicine ${medicineId}`);
        }

        if (batch.availableQuantity < 0) {
          throw new Error(`Insufficient available stock in batch ${batch.batchNumber} for medicine ${medicineId}`);
        }

        if (batch.reservedQuantity < 0) {
          throw new Error(`Reserved quantity corruption in batch ${batch.batchNumber}: went below zero`);
        }
      }

      // 2. Update Inventory Availability (Aggregate branch level)
      // P2 Fix: Use upsert directly and use its return value to determine quantityAfter.
      // We still need quantityBefore for the movement log.
      const availability = await tx.inventory.upsert({
        where: {
          tenantId_branchId_medicineId: { tenantId, branchId, medicineId }
        },
        update: {
          currentStock: { increment: quantity },
          reservedStock: (quantity < 0 && isReserved) ? { increment: quantity } : undefined
        },
        create: {
          tenantId,
          branchId,
          medicineId,
          currentStock: quantity,
          reservedStock: (quantity < 0 && isReserved) ? quantity : 0,
          reorderPoint: 10,
          status: 'HEALTHY'
        }
      });
      
      const quantityAfter = availability.currentStock;
      const quantityBefore = quantityAfter - quantity;

      if (quantityAfter < 0) {
        throw new Error(`Insufficient total stock for medicine ${medicineId} in branch ${branchId || 'central'}`);
      }

      // Update Inventory Status
      let status = 'HEALTHY';
      if (availability.currentStock <= 0) status = 'OUT_OF_STOCK';
      else if (availability.currentStock <= availability.minimumStock) status = 'CRITICAL';
      else if (availability.currentStock <= availability.reorderPoint) status = 'LOW';

      if (status !== availability.status) {
        // Lifecycle: Resolve alerts if returning to safe levels
        if (status === 'HEALTHY' || (status === 'LOW' && availability.status === 'OUT_OF_STOCK')) {
           await tx.stockAlert.updateMany({
             where: { 
               medicineId, 
               tenantId, 
               branchId, 
               isResolved: false,
               type: availability.status === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : undefined
             },
             data: { 
               isResolved: true, 
               resolvedAt: new Date(),
               resolutionNote: `Stock level recovered to ${status}`
             }
           });
        }

        await tx.inventory.update({
          where: { id: availability.id },
          data: { status }
        });
        availability.status = status;
      }

      // 3. Log Stock Movement (Immutable Ledger)
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          branchId,
          medicineId,
          batchId,
          movementType,
          quantity,
          quantityAfter: availability.currentStock,
          quantityBefore,
          referenceType,
          referenceId: referenceId || null,
          performedBy: userId,
          notes,
          idempotencyKey: idempotencyKey || crypto.randomUUID()
        }
      });

      return { movement, batch, availability };
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * STOCK IN: New inventory arrives
   */
  async stockIn(tenantId, data, userId, externalTx) {
    const execute = async (tx) => {
      const { 
        medicineId, batchNumber, quantity, expiryDate, 
        purchasePrice, sellingPrice, mrp, branchId, notes, 
        supplierId, storageType, purchaseOrderItemId 
      } = data;

      // 1. Create or Find Batch
      const batch = await tx.inventoryBatch.upsert({
        where: {
          tenantId_branchId_medicineId_batchNumber: {
            tenantId, branchId, medicineId, batchNumber
          }
        },
        update: {
          quantity: { increment: quantity },
          availableQuantity: { increment: quantity },
          receivedQuantity: { increment: quantity },
          expiryDate: new Date(expiryDate),
          purchasePrice,
          sellingPrice,
          mrp,
          supplierId,
          storageType: storageType || 'NORMAL',
          purchaseOrderItemId
        },
        create: {
          tenantId,
          branchId,
          medicineId,
          batchNumber,
          quantity,
          availableQuantity: quantity,
          receivedQuantity: quantity,
          expiryDate: new Date(expiryDate),
          purchasePrice,
          sellingPrice,
          mrp,
          supplierId,
          status: 'ACTIVE',
          storageType: storageType || 'NORMAL',
          purchaseOrderItemId
        }
      });

      await this.recordMovement(tenantId, {
        medicineId,
        batchId: batch.id,
        branchId,
        movementType: 'PURCHASE',
        quantity,
        referenceType: data.referenceType || 'MANUAL_ENTRY',
        referenceId: data.referenceId,
        notes
      }, userId, tx);

      return batch;
    };

    const batch = externalTx ? await execute(externalTx) : await prisma.$transaction(execute);

    if (data.skipSideEffects) {
      return batch;
    }

    try {
      await inventorySyncService.triggerSync(tenantId, batch.medicineId, 'STOCK_IN');
    } catch (syncError) {
      logger.error({ err: syncError.message }, '[STOCK] E-commerce sync failed (non-critical)');
    }

    try {
      emitLocalEvent(DOMAIN_EVENTS.STOCK_UPDATED, { medicineId: batch.medicineId, tenantId, type: 'STOCK_IN' });
      await emitEvent(DOMAIN_EVENTS.STOCK_UPDATED, { medicineId: batch.medicineId, tenantId, type: 'STOCK_IN' });
    } catch (eventError) {
      logger.error({ err: eventError.message }, '[STOCK] Event emission failed (non-critical)');
    }

    return batch;
  }

  async stockOut(tenantId, data, userId, externalTx) {
    const execute = async (tx) => {
      const { medicineId, quantity, type, referenceType, referenceId, notes, branchId } = data;

      const batches = await tx.inventoryBatch.findMany({
        where: {
          tenantId,
          branchId,
          medicineId,
          availableQuantity: { gt: 0 },
          deletedAt: null,
          expiryDate: { gt: new Date() },
          status: 'ACTIVE'
        },
        orderBy: { expiryDate: 'asc' }
      });

      const totalAvailable = batches.reduce((sum, b) => sum + b.availableQuantity, 0);
      if (totalAvailable < quantity) {
        throw new Error(`Insufficient stock for medicine ID ${medicineId}. Available: ${totalAvailable}, Requested: ${quantity}`);
      }

      // 2. Deduct from batches using FEFO and record movements
      let remainingToDeduct = quantity;
      const results = [];

      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const deductFromThisBatch = Math.min(batch.availableQuantity, remainingToDeduct);
        
        const result = await this.recordMovement(tenantId, {
          medicineId: medicineId,
          batchId: batch.id,
          branchId,
          movementType: type,
          quantity: -deductFromThisBatch,
          referenceType,
          referenceId,
          notes
        }, userId, tx);

        results.push(result);
        remainingToDeduct -= deductFromThisBatch;
      }

      return { totalDeducted: quantity, batchDeductions: results, totalAvailableBefore: totalAvailable };
    };

    const checkoutResult = externalTx ? await execute(externalTx) : await prisma.$transaction(execute);
    const { medicineId, quantity, branchId } = data;

    // 3. Post-movement logic (Sync, Alerts) - Outside transaction
    try {
      const currentTotalStock = checkoutResult.totalAvailableBefore - quantity;
      
      await inventorySyncService.triggerSync(tenantId, medicineId, 'STOCK_OUT');

      emitLocalEvent(DOMAIN_EVENTS.STOCK_UPDATED, { medicineId, tenantId, type: 'STOCK_OUT' });
      await emitEvent(DOMAIN_EVENTS.STOCK_UPDATED, { medicineId, tenantId, type: 'STOCK_OUT' });

      // Check for low stock alert using dynamic thresholds
      const thresholds = await alertSettingsService.getEffectiveThresholds(tenantId, medicineId, branchId);
      
      if (currentTotalStock <= thresholds.lowStock) {
        const severity = currentTotalStock <= thresholds.criticalStock ? 'CRITICAL' : 'WARNING';
        emitLocalEvent(DOMAIN_EVENTS.STOCK_LOW, { 
          medicineId, 
          tenantId, 
          currentStock: currentTotalStock, 
          threshold: thresholds.lowStock,
          severity,
          branchId
        });
        await emitEvent(DOMAIN_EVENTS.STOCK_LOW, { 
          medicineId, 
          tenantId, 
          currentStock: currentTotalStock, 
          threshold: thresholds.lowStock,
          severity,
          branchId
        });
      }
    } catch (sideEffectError) {
      logger.error({ err: sideEffectError.message }, '[STOCK] Post-stockOut side-effects failed (non-critical)');
    }

    return checkoutResult;
  }

  /**
   * RECORD DAMAGE
   */
  async recordDamage(tenantId, data, userId, externalTx) {
    const execute = async (tx) => {
      const { batchId, quantity, reason, branchId, medicineId } = data;

      const result = await this.recordMovement(tenantId, {
        medicineId,
        batchId,
        branchId,
        movementType: 'DAMAGE',
        quantity: -quantity,
        referenceType: 'DAMAGE_LOG',
        notes: reason
      }, userId, tx);

      // Create a damaged stock record for audit
      await tx.damagedStock.create({
        data: {
          tenantId,
          batchId,
          quantity,
          reason,
          reportedBy: userId
        }
      });

      return result;
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * RESERVE STOCK: Block stock for an order
   */
  async reserveStock(tenantId, { medicineId, branchId, batchId, quantity }, userId, externalTx) {
    const execute = async (tx) => {
      // 1. Update Batch
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: {
          availableQuantity: { decrement: quantity },
          reservedQuantity: { increment: quantity }
        }
      });

      // 2. Update Branch Inventory Snapshot
      await tx.inventory.update({
        where: {
          tenantId_branchId_medicineId: { tenantId, branchId, medicineId }
        },
        data: {
          reservedStock: { increment: quantity }
        }
      });

      return { success: true };
    };

    return externalTx ? execute(externalTx) : prisma.$transaction(execute);
  }

  /**
   * BATCH RECALL: Mark batch as recalled and block sales
   */
  async recallBatch(tenantId, batchId, reason) {
    return prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.update({
        where: { id: batchId, tenantId },
        data: {
          status: 'RECALLED',
          recalled: true
        },
        include: { medicine: true }
      });

      logger.warn({ batchId, tenantId, reason }, 'Batch recalled');

      return batch;
    });
  }
}

export default new MovementService();
