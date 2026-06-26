import metadataRepository from '../repositories/metadata.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';

class MetadataService {
  /**
   * Get procurement intelligence (suppliers + reliability)
   */
  async getMedicineSuppliers(medicineId, tenantId) {
    const suppliers = await metadataRepository.findMedicineSuppliers(medicineId, tenantId);
    return {
      medicineId,
      suppliers: suppliers.map((s) => ({
        supplierId: s.supplierId,
        supplierName: s.supplier.name,
        averagePurchasePrice: s.averagePurchasePrice,
        averageLeadTimeDays: s.leadDays,
        lastPurchaseDate: s.lastPurchaseDate,
        reliabilityScore: s.reliabilityScore,
        isPreferred: s.isPreferred,
      })),
    };
  }

  /**
   * Map a new supplier to a medicine with governance
   */
  async addMedicineSupplier(tenantId, userId, medicineId, data) {
    const mapping = await metadataRepository.upsertMedicineSupplier(tenantId, {
      ...data,
      medicineId,
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'ADD_MEDICINE_SUPPLIER',
      target: medicineId,
      type: 'PROCUREMENT',
      metadata: { supplierId: data.supplierId },
    });

    await eventBus.publish('MEDICINE_SUPPLIER_ADDED', {
      medicineId,
      supplierId: data.supplierId,
      tenantId,
    });

    return mapping;
  }

  /**
   * Get procurement trends (purchase history)
   */
  async getPurchaseHistory(medicineId, tenantId) {
    const history = await metadataRepository.findPurchaseHistory(medicineId, tenantId);

    // Aggregation Logic (Simple for now, could be from pre-aggregated tables)
    const totalPurchased = history.reduce((sum, h) => sum + h.quantity, 0);
    const avgPrice =
      history.length > 0 ? history.reduce((sum, h) => sum + h.unitPrice, 0) / history.length : 0;

    return {
      medicineId,
      summary: {
        totalPurchased,
        averagePurchasePrice: avgPrice,
      },
      history: history.map((h) => ({
        orderNumber: h.purchaseOrder.orderNumber,
        supplierName: h.purchaseOrder.supplier.name,
        quantity: h.quantity,
        unitPrice: h.unitPrice,
        receivedAt: h.createdAt,
      })),
    };
  }

  /**
   * Get movement intelligence (stock history)
   */
  async getStockHistory(medicineId, tenantId) {
    const movements = await metadataRepository.findStockHistory(medicineId, tenantId);

    return {
      medicineId,
      stockMovements: movements.map((m) => ({
        movementType: m.transactionType,
        quantity: m.quantityChange,
        previousStock: m.quantityAfter - m.quantityChange,
        newStock: m.quantityAfter,
        referenceType: m.referenceType,
        performedBy: m.user?.fullName,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Get expiry intelligence (wastage analytics)
   */
  async getExpiryHistory(medicineId, tenantId) {
    const batches = await metadataRepository.findExpiryHistory(medicineId, tenantId);
    const now = new Date();

    const expiredBatches = batches.filter((b) => b.expiryDate <= now);
    const nearExpiryBatches = batches.filter((b) => {
      const diff = b.expiryDate.getTime() - now.getTime();
      const days = diff / (1000 * 3600 * 24);
      return days > 0 && days <= 30;
    });

    return {
      medicineId,
      summary: {
        totalExpiredQty: expiredBatches.reduce((sum, b) => sum + b.availableQuantity, 0),
        nearExpiryQty: nearExpiryBatches.reduce((sum, b) => sum + b.availableQuantity, 0),
      },
      expiredBatches: expiredBatches.map((b) => ({
        batchNumber: b.batchNumber,
        expiredQuantity: b.quantity,
        expiryDate: b.expiryDate,
        supplier: b.supplier?.name,
      })),
      nearExpiryBatches: nearExpiryBatches.map((b) => ({
        batchNumber: b.batchNumber,
        remainingQuantity: b.quantity,
        expiryDate: b.expiryDate,
        daysToExpiry: Math.ceil((b.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24)),
      })),
    };
  }
}

export default new MetadataService();
