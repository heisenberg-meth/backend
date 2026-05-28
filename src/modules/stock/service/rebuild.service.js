import prisma from "../../../config/prisma.js";
import logger from '../../../shared/utils/logger.js';

class InventoryRebuildService {
  /**
   * Rebuilds the currentStock for a medicine in a branch based on stock movements.
   */
  async rebuildMedicineStock(tenantId, medicineId, branchId = null) {
    logger.info({ tenantId, medicineId, branchId }, 'Rebuilding medicine stock from movements');

    return prisma.$transaction(async (tx) => {
      // 1. Calculate sum of movements for the medicine/branch
      const movementSum = await tx.stockMovement.aggregate({
        where: {
          tenantId,
          medicineId,
          branchId,
        },
        _sum: {
          quantity: true
        }
      });

      const totalQuantity = movementSum._sum.quantity || 0;

      // 2. Update the Inventory (Snapshot) table
      const inventory = await tx.inventory.upsert({
        where: {
          tenantId_branchId_medicineId: { tenantId, branchId, medicineId }
        },
        update: {
          currentStock: totalQuantity
        },
        create: {
          tenantId,
          branchId,
          medicineId,
          currentStock: totalQuantity,
          status: totalQuantity > 0 ? 'HEALTHY' : 'OUT_OF_STOCK'
        }
      });

      // 3. Rebuild Batch-level quantities
      const batches = await tx.inventoryBatch.findMany({
        where: {
          tenantId,
          medicineId,
          branchId,
          deletedAt: null
        }
      });

      for (const batch of batches) {
        const batchMovementSum = await tx.stockMovement.aggregate({
          where: {
            tenantId,
            medicineId,
            branchId,
            batchId: batch.id
          },
          _sum: {
            quantity: true
          }
        });

        const batchQuantity = batchMovementSum._sum.quantity || 0;

        // Note: For availableQuantity, we need to respect reservations.
        // Since reservations are currently just a number in the batch, 
        // we keep the existing reservedQuantity but recalculate availableQuantity.
        const availableQuantity = batchQuantity - batch.reservedQuantity;

        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            quantity: batchQuantity,
            availableQuantity: availableQuantity
          }
        });
      }

      return {
        totalQuantity,
        inventoryId: inventory.id,
        batchCount: batches.length
      };
    });
  }

  /**
   * Rebuilds all inventory for a tenant.
   * WARNING: Expensive operation.
   */
  async rebuildTenantInventory(tenantId) {
    const medicines = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true }
    });

    const results = [];
    for (const med of medicines) {
      // For simplicity, we assume one branch or we'd need to loop over branches
      // In this system, branches are prominent.
      const branches = await prisma.branch.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true }
      });

      for (const branch of branches) {
        const result = await this.rebuildMedicineStock(tenantId, med.id, branch.id);
        results.push(result);
      }
    }

    return {
      medicinesProcessed: medicines.length,
      branchesProcessed: results.length
    };
  }
}

export default new InventoryRebuildService();
