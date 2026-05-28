import bwipjs from 'bwip-js';
import { printingQueue } from '../queue/printing.queue.js';
import logger from '../../../shared/utils/logger.js';
import prisma from '../../../config/prisma.js';

class PrintingService {
  /**
   * Generates a code128 barcode buffer
   */
  async generateCode128(text) {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        {
          bcid: 'code128',
          text,
          scale: 3,
          height: 10,
          includetext: true,
          textxalign: 'center',
        },
        (err, png) => {
          if (err) reject(err);
          else resolve(png);
        },
      );
    });
  }

  /**
   * Queue a bulk print job
   */
  async queueBulkPrint(items, tenantId) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Items array is required for bulk printing');
    }

    const job = await printingQueue.add('bulk-print', {
      items,
      tenantId
    });

    return { jobId: job.id, status: 'Queued' };
  }

  /**
   * Worker processor for bulk printing
   * In a real world scenario, this would format the data into ESC/POS commands
   * and send them to a thermal printer via network or local print spooler.
   */
  async processBulkPrint(data) {
    const { items, tenantId } = data;
    
    // Simulate processing delay per item
    for (const item of items) {
      logger.info(`[Printer] Generating label for ${item.medicineName} (Batch: ${item.batchNumber})`);
      
      // Simulate label generation
      await this.generateCode128(item.barcode);
      
      // Simulate sending to network printer
      await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    logger.info(`[Printer] Successfully printed ${items.length} labels for tenant ${tenantId}`);
  }

  /**
   * Retrieve label data for a medicine/batch combination
   */
  async getLabelData(medicineId, batchId, tenantId) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
      include: {
        manufacturer: { select: { name: true } },
      },
    });

    if (!medicine) throw new Error('Medicine not found');

    let batch = null;
    if (batchId) {
       batch = await prisma.inventoryBatch.findFirst({
           where: { id: batchId, tenantId, deletedAt: null }
       });
    } else {
       batch = await prisma.inventoryBatch.findFirst({
          where: { medicineId, tenantId, deletedAt: null },
          orderBy: { createdAt: 'desc' }
       });
    }

    // Try to get a specific batch barcode, otherwise fallback to generic
    let barcodeRecord = null;
    if (batch) {
       barcodeRecord = await prisma.medicineBarcode.findFirst({
           where: { tenantId, batchId: batch.id }
       });
    }

    if (!barcodeRecord) {
        barcodeRecord = await prisma.medicineBarcode.findFirst({
            where: { tenantId, medicineId: medicine.id, batchId: null }
        });
    }

    const barcodeToPrint = barcodeRecord ? barcodeRecord.barcode : medicine.barcode;

    return {
      medicineName: medicine.name,
      genericName: medicine.genericName,
      strength: medicine.strength,
      barcode: barcodeToPrint,
      manufacturer: medicine.manufacturer?.name || '',
      batchNumber: batch?.batchNumber || 'N/A',
      expiryDate: batch?.expiryDate || 'N/A',
      mrp: batch?.sellingPrice || medicine.unitPrice,
    };
  }
}

export default new PrintingService();
