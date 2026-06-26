import medicineSearchRepository from '../repositories/medicine-search.repository.js';
import medicineSearchCache from '../cache/medicine-search.cache.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import inventoryCalculationService from '../../inventory/service/inventory-calculation.service.js';

class BarcodeLookupService {
  async lookup(barcode, tenantId) {
    const cached = await medicineSearchCache.getBarcode(barcode, tenantId);
    if (cached) {
      emitLocalEvent(DOMAIN_EVENTS.BARCODE_SCANNED, {
        tenantId,
        barcode,
        source: 'cache',
        timestamp: new Date().toISOString(),
      });

      return { ...cached, source: 'cache' };
    }

    let medicine = await medicineSearchRepository.findByBarcode(barcode, tenantId);

    if (!medicine) {
      medicine = await medicineSearchRepository.findByBarcodeMapping(barcode, tenantId);
    }

    if (!medicine) {
      return null;
    }

    const result = this.enrichWithBarcodeData(medicine);

    await medicineSearchCache.setBarcode(barcode, tenantId, result);

    emitLocalEvent(DOMAIN_EVENTS.BARCODE_SCANNED, {
      tenantId,
      barcode,
      medicineId: medicine.id,
      source: 'database',
      timestamp: new Date().toISOString(),
    });

    await emitEvent(DOMAIN_EVENTS.BARCODE_SCANNED, {
      tenantId,
      barcode,
      medicineId: medicine.id,
    });

    return { ...result, source: 'database' };
  }

  enrichWithBarcodeData(medicine) {
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

    const earliestExpiry =
      batches.length > 0
        ? batches.reduce(
            (earliest, b) =>
              new Date(b.expiryDate) < new Date(earliest) ? b.expiryDate : earliest,
            batches[0].expiryDate,
          )
        : null;

    const isNearExpiry = earliestExpiry ? this.isNearExpiry(earliestExpiry) : false;
    const isExpired = earliestExpiry ? new Date(earliestExpiry) < new Date() : false;

    const bestPrice =
      batches.length > 0 ? Math.min(...batches.map((b) => b.sellingPrice)) : medicine.sellingPrice;

    const bestMrp = batches.length > 0 ? Math.max(...batches.map((b) => b.mrp)) : null;

    const expiryWarning = isExpired
      ? { type: 'EXPIRED', message: 'This medicine has expired' }
      : isNearExpiry
        ? {
            type: 'NEAR_EXPIRY',
            message: `Expires on ${new Date(earliestExpiry).toLocaleDateString()}`,
          }
        : null;

    return {
      medicine: {
        id: medicine.id,
        brandName: medicine.name,
        genericName: medicine.genericName,
        strength: medicine.strength,
        dosageForm: medicine.dosageForm,
        manufacturer: medicine.manufacturer?.name,
        category: medicine.category?.name,
        barcode: medicine.barcode,
        sku: medicine.sku,
        hsnCode: medicine.hsnCode,
        scheduleType: medicine.scheduleType,
        prescriptionRequired: medicine.prescriptionRequired,
        gstPercentage: medicine.gstPercentage,
        storageCondition: medicine.storageCondition,
      },
      pricing: {
        sellingPrice: bestPrice,
        mrp: bestMrp,
        unitPrice: medicine.unitPrice,
        gstPercentage: medicine.gstPercentage,
      },
      inventory: {
        availableStock,
        totalStock,
        reservedStock,
        earliestExpiry,
        isNearExpiry,
        isExpired,
        batchCount: batches.length,
        branchAvailability: Object.values(branchAvailability),
      },
      compliance: {
        prescriptionRequired: medicine.prescriptionRequired,
        scheduleType: medicine.scheduleType,
        warning: medicine.prescriptionRequired ? 'Prescription Required' : null,
      },
      expiryWarning,
    };
  }

  isNearExpiry(expiryDate, daysThreshold = 90) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);
    return new Date(expiryDate) <= threshold;
  }

  async invalidateCache(barcode, tenantId) {
    await medicineSearchCache.invalidateBarcode(barcode, tenantId);
  }
}

export default new BarcodeLookupService();
