import medicineSearchRepository from '../repositories/medicine-search.repository.js';
import medicineSearchCache from '../cache/medicine-search.cache.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import inventoryCalculationService from '../../inventory/service/inventory-calculation.service.js';

class SkuLookupService {
  async lookup(sku, tenantId) {
    const cached = await medicineSearchCache.getSku(sku, tenantId);
    if (cached) {
      emitLocalEvent(DOMAIN_EVENTS.SKU_LOOKUP, {
        tenantId,
        sku,
        source: 'cache',
        timestamp: new Date().toISOString(),
      });

      return { ...cached, source: 'cache' };
    }

    const medicine = await medicineSearchRepository.findBySku(sku, tenantId);

    if (!medicine) {
      return null;
    }

    const result = this.enrichWithSkuData(medicine);

    await medicineSearchCache.setSku(sku, tenantId, result);

    emitLocalEvent(DOMAIN_EVENTS.SKU_LOOKUP, {
      tenantId,
      sku,
      medicineId: medicine.id,
      source: 'database',
      timestamp: new Date().toISOString(),
    });

    return { ...result, source: 'database' };
  }

  enrichWithSkuData(medicine) {
    const batches = medicine.inventoryBatches || [];
    const availableStock = inventoryCalculationService.calculateAvailableStock(batches);
    const reservedStock = inventoryCalculationService.calculateReservedStock(batches);
    const totalStock = availableStock + reservedStock;

    const branchAvailability = batches.reduce((acc, batch) => {
      const branchKey = batch.branchId || 'unassigned';
      if (!acc[branchKey]) {
        acc[branchKey] = {
          branchId: batch.branchId,
          totalStock: 0,
          availableStock: 0,
        };
      }
      acc[branchKey].totalStock += (batch.availableQuantity || 0) + (batch.reservedQuantity || 0);
      acc[branchKey].availableStock += batch.availableQuantity || 0;
      return acc;
    }, {});

    return {
      medicine: {
        id: medicine.id,
        brandName: medicine.name,
        genericName: medicine.genericName,
        strength: medicine.strength,
        dosageForm: medicine.dosageForm,
        manufacturer: medicine.manufacturer?.name,
        category: medicine.category?.name,
        sku: medicine.sku,
        barcode: medicine.barcode,
        hsnCode: medicine.hsnCode,
        scheduleType: medicine.scheduleType,
        prescriptionRequired: medicine.prescriptionRequired,
        gstPercentage: medicine.gstPercentage,
        rackLocation: medicine.rackLocation,
        storageCondition: medicine.storageCondition,
      },
      inventory: {
        availableStock,
        totalStock,
        reservedStock,
        batchCount: batches.length,
        branchAvailability: Object.values(branchAvailability),
      },
      pricing: {
        sellingPrice: medicine.sellingPrice,
        unitPrice: medicine.unitPrice,
        gstPercentage: medicine.gstPercentage,
      },
    };
  }

  async invalidateCache(sku, tenantId) {
    await medicineSearchCache.invalidateSku?.(sku, tenantId);
  }
}

export default new SkuLookupService();
