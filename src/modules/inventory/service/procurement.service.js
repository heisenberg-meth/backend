import prisma from '../../../config/prisma.js';

class ProcurementService {
  /**
   * Generates reorder suggestions for a tenant/branch
   */
  async getReorderSuggestions(tenantId, branchId = null) {
    // 1. Get all medicines where current stock <= reorder level
    const lowStockItems = await prisma.inventory.findMany({
      where: {
        tenantId,
        branchId,
        currentStock: { lte: prisma.inventory.fields.reorderPoint },
      },
      include: {
        medicine: {
          include: {
            supplierItems: {
              where: { isPreferred: true },
              include: { supplier: true },
            },
          },
        },
      },
    });

    // 2. Format suggestions
    const suggestions = lowStockItems.map((item) => {
      const preferredSupplier = item.medicine.supplierItems[0]?.supplier;

      return {
        medicineId: item.medicineId,
        medicineName: item.medicine.name,
        currentStock: item.currentStock,
        reorderPoint: item.reorderPoint,
        suggestedQuantity: item.reorderQuantity,
        preferredSupplierId: preferredSupplier?.id || null,
        preferredSupplierName: preferredSupplier?.name || 'Manual Selection Required',
        estimatedLeadTime: preferredSupplier?.leadTimeDays || 7,
      };
    });

    return suggestions;
  }

  /**
   * Automatically raises Draft Purchase Orders for low stock items
   */
  async autoRaiseDraftPOs(tenantId, branchId, userId) {
    const suggestions = await this.getReorderSuggestions(tenantId, branchId);

    // Group by supplier
    const supplierGroups = suggestions.reduce((groups, s) => {
      const key = s.preferredSupplierId || 'MANUAL';
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
      return groups;
    }, {});

    const createdPOs = [];

    for (const [supplierId, items] of Object.entries(supplierGroups)) {
      if (supplierId === 'MANUAL') continue;

      const po = await prisma.purchaseOrder.create({
        data: {
          tenantId,
          branchId,
          supplierId,
          userId,
          orderNumber: `AUTO-PO-${Date.now()}`,
          status: 'DRAFT',
          items: {
            create: items.map((item) => ({
              medicineId: item.medicineId,
              medicineName: item.medicineName,
              quantity: item.suggestedQuantity,
              unitPrice: 0, // To be filled by procurement staff
              totalAmount: 0,
              currentStock: item.currentStock,
              reorderQty: item.suggestedQuantity,
            })),
          },
        },
      });
      createdPOs.push(po);
    }

    return createdPOs;
  }
}

export default new ProcurementService();
