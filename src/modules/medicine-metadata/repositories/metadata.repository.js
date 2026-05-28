import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';

class MetadataRepository {
  /**
   * Get suppliers for a specific medicine
   */
  async findMedicineSuppliers(medicineId, tenantId) {
    return await prisma.medicineSupplier.findMany({
      where: { medicineId, tenantId },
      include: {
        supplier: {
          select: { id: true, name: true, phone: true, rating: true }
        }
      },
      orderBy: [
        { isPreferred: 'desc' },
        { reliabilityScore: 'desc' }
      ]
    });
  }

  /**
   * Add or update a medicine-supplier mapping
   */
  async upsertMedicineSupplier(tenantId, data) {
    const { medicineId, supplierId, isPreferred } = data;

    return await prisma.$transaction(async (tx) => {
      // If setting as preferred, unset any existing preferred supplier
      if (isPreferred) {
        await tx.medicineSupplier.updateMany({
          where: { medicineId, tenantId, isPreferred: true },
          data: { isPreferred: false }
        });
      }

      return await tx.medicineSupplier.upsert({
        where: {
          medicineId_supplierId: { medicineId, supplierId }
        },
        update: data,
        create: { ...data, tenantId }
      });
    });
  }

  /**
   * Get purchase history for a medicine
   */
  async findPurchaseHistory(medicineId, tenantId, limit = 50) {
    // Joining via PurchaseOrderItem
    return await prisma.purchaseOrderItem.findMany({
      where: { 
        medicineId, 
        purchaseOrder: { tenantId, status: PURCHASE_ORDER_STATUS.RECEIVED } 
      },
      include: {
        purchaseOrder: {
          include: {
            supplier: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Get stock movement history (InventoryTransaction)
   */
  async findStockHistory(medicineId, tenantId, limit = 50) {
    return await prisma.inventoryTransaction.findMany({
      where: { medicineId, tenantId },
      include: {
        user: { select: { fullName: true } },
        batch: { select: { batchNumber: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Get expiry history/status for a medicine
   */
  async findExpiryHistory(medicineId, tenantId) {
    // Current stock that is expired or near-expiry
    return await prisma.inventoryBatch.findMany({
      where: {
        medicineId,
        tenantId,
        // Include both active and expired to see historical trends in current stock
      },
      include: {
        supplier: { select: { name: true } }
      },
      orderBy: { expiryDate: 'asc' }
    });
  }
}

export default new MetadataRepository();
