import bwipjs from 'bwip-js';
import prisma from '../../../config/prisma.js';

class BarcodeService {
  async generateBarcode(text, type = 'code128') {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer({
        bcid: type,
        text,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
      }, (err, png) => {
        if (err) reject(err);
        else resolve(png);
      });
    });
  }

  async scanBarcode(barcode, tenantId) {
    const medicine = await prisma.medicine.findFirst({
      where: { barcode, tenantId, deletedAt: null },
      include: {
        category: true,
        manufacturer: true,
        inventoryBatches: {
          where: { deletedAt: null, quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
          take: 1,
        },
      },
    });

    if (!medicine) {
      throw new Error('No medicine found for this barcode');
    }

    const fefoBatch = medicine.inventoryBatches[0] || null;

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
      fefoBatch: fefoBatch ? {
        id: fefoBatch.id,
        batchNumber: fefoBatch.batchNumber,
        quantity: fefoBatch.quantity,
        sellingPrice: fefoBatch.sellingPrice,
        expiryDate: fefoBatch.expiryDate,
      } : null,
    };
  }

  async getPrintData(medicineId, tenantId) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
      include: {
        manufacturer: { select: { name: true } },
        inventoryBatches: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!medicine) throw new Error('Medicine not found');

    const latestBatch = medicine.inventoryBatches[0];

    return {
      medicineName: medicine.name,
      genericName: medicine.genericName,
      strength: medicine.strength,
      dosageForm: medicine.dosageForm,
      barcode: medicine.barcode,
      manufacturer: medicine.manufacturer?.name || '',
      price: medicine.unitPrice,
      batchNumber: latestBatch?.batchNumber || '',
      expiryDate: latestBatch?.expiryDate || '',
      mrp: latestBatch?.sellingPrice || medicine.unitPrice,
    };
  }
}

export default new BarcodeService();
