import prisma from '../../../config/prisma.js';

class CentralizedInventoryService {
  /**
   * Get global inventory across all branches
   */
  async getGlobalInventory(tenantId, filters = {}) {
    const { search, categoryId } = filters;

    const medicines = await prisma.medicine.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { genericName: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(categoryId && { categoryId }),
      },
      include: {
        inventoryBatches: {
          where: { deletedAt: null, status: 'ACTIVE' },
          include: { branch: true },
        },
      },
    });

    return medicines.map((med) => {
      const branchSummary = {};
      let totalGlobalQuantity = 0;

      med.inventoryBatches.forEach((batch) => {
        const branchId = batch.branchId || 'unassigned';
        const branchName = batch.branch ? batch.branch.name : 'Central Warehouse';

        if (!branchSummary[branchId]) {
          branchSummary[branchId] = { branchName, quantity: 0 };
        }
        branchSummary[branchId].quantity += batch.quantity;
        totalGlobalQuantity += batch.quantity;
      });

      return {
        id: med.id,
        name: med.name,
        genericName: med.genericName,
        totalGlobalQuantity,
        branchBreakdown: Object.values(branchSummary),
      };
    });
  }

  async getBranchInventory(tenantId, branchId, filters = {}) {
    const { search } = filters;

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        branchId,
        medicine: {
          tenantId,
          ...(search && {
            name: { contains: search, mode: 'insensitive' },
          }),
        },
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: { medicine: true },
    });

    const medicineMap = {};
    batches.forEach((batch) => {
      if (!medicineMap[batch.medicineId]) {
        medicineMap[batch.medicineId] = {
          id: batch.medicine.id,
          name: batch.medicine.name,
          totalQuantity: 0,
          batches: [],
        };
      }
      medicineMap[batch.medicineId].totalQuantity += batch.quantity;
      medicineMap[batch.medicineId].batches.push({
        batchNumber: batch.batchNumber,
        quantity: batch.quantity,
        expiryDate: batch.expiryDate,
      });
    });

    return Object.values(medicineMap);
  }
}

export default new CentralizedInventoryService();
