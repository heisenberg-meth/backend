import prisma from '../../../config/prisma.js';
import { initRedis } from '../../../config/redis.js';

const redisClient = initRedis();

class ScannerService {
  async scanBarcode(barcode, tenantId) {
    const cacheKey = `barcode:${tenantId}:${barcode}`;

    const cached = await redisClient.get(cacheKey);
    let mapping;

    if (cached) {
      mapping = JSON.parse(cached);
    } else {
      let record = await prisma.medicineBarcode.findFirst({
        where: { barcode, tenantId },
        select: { medicineId: true, batchId: true },
      });

      if (!record) {
        const med = await prisma.medicine.findFirst({
          where: { barcode, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (med) {
          record = { medicineId: med.id, batchId: null };
        }
      }

      if (!record) {
        throw new Error('Barcode not found in system.');
      }

      mapping = record;
      await redisClient.set(cacheKey, JSON.stringify(mapping), 'EX', 86400);
    }

    return this.resolveInventory(mapping.medicineId, mapping.batchId, tenantId);
  }

  async resolveInventory(medicineId, batchId, tenantId) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
      include: {
        category: true,
        manufacturer: true,
      },
    });

    if (!medicine) throw new Error('Medicine associated with barcode not found or deleted.');

    let resolvedBatch = null;

    if (batchId) {
      resolvedBatch = await prisma.inventoryBatch.findFirst({
        where: { id: batchId, tenantId, deletedAt: null, status: 'ACTIVE' },
      });
    } else {
      const batches = await prisma.inventoryBatch.findMany({
        where: { medicineId, tenantId, deletedAt: null, status: 'ACTIVE', quantity: { gt: 0 } },
        orderBy: { expiryDate: 'asc' },
        take: 1,
      });
      resolvedBatch = batches[0] || null;
    }

    return {
      medicine: {
        id: medicine.id,
        name: medicine.name,
        genericName: medicine.genericName,
        dosageForm: medicine.dosageForm,
        strength: medicine.strength,
        unitPrice: medicine.unitPrice,
        gstPercentage: medicine.gstPercentage,
        prescriptionRequired: medicine.prescriptionRequired,
        category: medicine.category?.name || null,
        manufacturer: medicine.manufacturer?.name || null,
      },
      batch: resolvedBatch
        ? {
            id: resolvedBatch.id,
            batchNumber: resolvedBatch.batchNumber,
            quantity: resolvedBatch.quantity,
            sellingPrice: resolvedBatch.sellingPrice,
            expiryDate: resolvedBatch.expiryDate,
          }
        : null,
    };
  }
}

export default new ScannerService();
