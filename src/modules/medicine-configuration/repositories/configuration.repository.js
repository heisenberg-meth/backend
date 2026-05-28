import prisma from '../../../config/prisma.js';

class ConfigurationRepository {
  /**
   * Update medicine reorder point and related configs
   */
  async updateInventoryConfig(medicineId, tenantId, data) {
    const { branchId, reorderPoint, safetyStock, maxStockLimit, updatedBy } = data;

    // Use transaction to update Medicine level reorder point and specific branch config
    return await prisma.$transaction(async (tx) => {
      // 1. Update main medicine table reorderLevel (as default)
      if (!branchId) {
        await tx.medicine.update({
          where: { id: medicineId },
          data: { reorderLevel: reorderPoint }
        });
      }

      // 2. Upsert branch specific or default config record
      const existing = await tx.medicineInventoryConfig.findFirst({
        where: { medicineId, tenantId, branchId: branchId || null }
      });

      if (existing) {
        return await tx.medicineInventoryConfig.update({
          where: { id: existing.id },
          data: { reorderPoint, safetyStock, maxStockLimit, updatedBy, updatedAt: new Date() }
        });
      }

      return await tx.medicineInventoryConfig.create({
        data: {
          medicineId,
          tenantId,
          branchId: branchId || null,
          reorderPoint,
          safetyStock,
          maxStockLimit,
          updatedBy
        }
      });
    });
  }

  /**
   * Update pricing and record history
   */
  async updatePricing(medicineId, tenantId, data) {
    const { mrp, sellingPrice, purchasePrice, changedBy } = data;

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current price for history
      const currentMedicine = await tx.medicine.findUnique({
        where: { id: medicineId },
        select: { unitPrice: true, sellingPrice: true, storefrontPrice: true }
      });

      // Assuming unitPrice in Medicine model is purchasePrice for now (based on schema)
      // Actually, Medicine model has unitPrice and sellingPrice.
      
      // 2. Update Medicine table
      await tx.medicine.update({
        where: { id: medicineId },
        data: { 
          unitPrice: purchasePrice, // Map purchase to unitPrice
          sellingPrice: sellingPrice 
        }
      });

      // 3. Update MedicinePricing (current active record)
      await tx.medicinePricing.updateMany({
        where: { medicineId, tenantId, isActive: true },
        data: { isActive: false }
      });

      await tx.medicinePricing.create({
        data: {
          medicineId,
          tenantId,
          mrp,
          sellingPrice,
          purchasePrice,
          isActive: true
        }
      });

      // 4. Record History
      return await tx.medicinePriceHistory.create({
        data: {
          medicineId,
          tenantId,
          oldMrp: null, // Could fetch from existing Pricing if needed
          newMrp: mrp,
          oldSellingPrice: currentMedicine.sellingPrice,
          newSellingPrice: sellingPrice,
          oldPurchasePrice: currentMedicine.unitPrice,
          newPurchasePrice: purchasePrice,
          changedBy
        }
      });
    });
  }

  /**
   * Update status and record history
   */
  async updateStatus(medicineId, tenantId, data) {
    const { status, reason, changedBy } = data;

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch old status
      const medicine = await tx.medicine.findUnique({
        where: { id: medicineId },
        select: { status: true, isActive: true }
      });

      // 2. Update Medicine
      await tx.medicine.update({
        where: { id: medicineId },
        data: { 
          status,
          isActive: status === 'ACTIVE'
        }
      });

      // 3. Record History
      return await tx.medicineStatusHistory.create({
        data: {
          medicineId,
          tenantId,
          oldStatus: medicine.status,
          newStatus: status,
          reason,
          changedBy
        }
      });
    });
  }

  /**
   * Get Pricing History
   */
  async getPricingHistory(medicineId, tenantId) {
    return await prisma.medicinePriceHistory.findMany({
      where: { medicineId, tenantId },
      include: { changedByUser: { select: { fullName: true } } },
      orderBy: { changedAt: 'desc' }
    });
  }

  /**
   * Get Status History
   */
  async getStatusHistory(medicineId, tenantId) {
    return await prisma.medicineStatusHistory.findMany({
      where: { medicineId, tenantId },
      include: { changedByUser: { select: { fullName: true } } },
      orderBy: { changedAt: 'desc' }
    });
  }
}

export default new ConfigurationRepository();
