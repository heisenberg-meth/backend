import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

const DISPOSITION_TYPES = {
  RESTOCK: 'RESTOCK',
  DESTROY: 'DESTROY',
  QUARANTINE: 'QUARANTINE',
  SUPPLIER_RETURN: 'SUPPLIER_RETURN',
};

const COLD_CHAIN_MEDICINES = ['INSULIN', 'VACCINE', 'BIOLOGICAL'];

class InventoryReversalService {
  async processDisposition(returnId, tenantId, userId, dispositionOverrides = {}) {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, tenantId },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
      },
    });

    if (!returnRecord) {
      throw new Error('Return not found');
    }

    if (returnRecord.status !== 'APPROVED' && returnRecord.status !== 'REFUNDED') {
      throw new Error(`Cannot process disposition for return in status: ${returnRecord.status}`);
    }

    const results = [];

    for (const item of returnRecord.items) {
      const disposition = dispositionOverrides[item.id] || item.disposition;

      if (disposition === 'PENDING') {
        throw new Error(`Disposition not set for item: ${item.medicine.name}`);
      }

      if (this.requiresDestruction(item.medicine, returnRecord.returnReason)) {
        if (disposition === 'RESTOCK') {
          throw new Error(
            `Medicine ${item.medicine.name} cannot be restocked. Requires destruction.`
          );
        }
      }

      const result = await this.executeDisposition(
        returnRecord,
        item,
        disposition,
        userId
      );

      results.push(result);
    }

    return results;
  }

  async executeDisposition(returnRecord, item, disposition, userId) {
    switch (disposition) {
      case DISPOSITION_TYPES.RESTOCK:
        return this.restockItem(returnRecord, item, userId);
      case DISPOSITION_TYPES.DESTROY:
        return this.destroyItem(returnRecord, item, userId);
      case DISPOSITION_TYPES.QUARANTINE:
        return this.quarantineItem(returnRecord, item, userId);
      case DISPOSITION_TYPES.SUPPLIER_RETURN:
        return this.supplierReturnItem(returnRecord, item, userId);
      default:
        throw new Error(`Unknown disposition type: ${disposition}`);
    }
  }

  async restockItem(returnRecord, item, userId) {
    const updatedBatch = await prisma.inventoryBatch.update({
      where: { id: item.batchId },
      data: {
        quantity: { increment: item.returnedQuantity },
      },
    });

    await prisma.stockTransaction.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        type: 'RETURN',
        quantity: item.returnedQuantity,
        previousStock: updatedBatch.quantity - item.returnedQuantity,
        newStock: updatedBatch.quantity,
        referenceType: 'RETURN',
        referenceId: returnRecord.id,
        notes: `Restocked from return ${returnRecord.returnNumber}`,
        createdBy: userId,
      },
    });

    await prisma.inventoryTransaction.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        transactionType: 'RETURN',
        quantityChange: item.returnedQuantity,
        quantityAfter: updatedBatch.quantity,
        referenceType: 'RETURN',
        referenceId: returnRecord.id,
        performedBy: userId,
      },
    });

    await prisma.returnItem.update({
      where: { id: item.id },
      data: {
        disposition: 'RESTOCK',
        dispositionNotes: 'Restocked to inventory',
        disposedBy: userId,
        disposedAt: new Date(),
      },
    });

    emitLocalEvent(DOMAIN_EVENTS.INVENTORY_REVERSED, {
      returnId: returnRecord.id,
      itemId: item.id,
      disposition: 'RESTOCK',
      quantity: item.returnedQuantity,
      timestamp: new Date().toISOString(),
    });

    logger.info(
      `[InventoryReversal] Restocked ${item.returnedQuantity} x ${item.medicine.name} from ${returnRecord.returnNumber}`
    );

    return {
      itemId: item.id,
      medicineName: item.medicine.name,
      disposition: 'RESTOCK',
      quantity: item.returnedQuantity,
      success: true,
    };
  }

  async destroyItem(returnRecord, item, userId) {
    const updatedBatch = await prisma.inventoryBatch.update({
      where: { id: item.batchId },
      data: {
        quantity: { decrement: item.returnedQuantity },
      },
    });

    await prisma.damagedStock.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        quantity: item.returnedQuantity,
        reason: `Returned and destroyed: ${returnRecord.returnReason}`,
        reportedBy: userId,
      },
    });

    await prisma.stockTransaction.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        type: 'DAMAGE',
        quantity: -item.returnedQuantity,
        previousStock: updatedBatch.quantity + item.returnedQuantity,
        newStock: updatedBatch.quantity,
        referenceType: 'RETURN_DESTRUCTION',
        referenceId: returnRecord.id,
        notes: `Destroyed from return ${returnRecord.returnNumber}`,
        createdBy: userId,
      },
    });

    await prisma.inventoryTransaction.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        transactionType: 'DAMAGE',
        quantityChange: -item.returnedQuantity,
        quantityAfter: updatedBatch.quantity,
        referenceType: 'RETURN_DESTRUCTION',
        referenceId: returnRecord.id,
        performedBy: userId,
      },
    });

    await prisma.returnItem.update({
      where: { id: item.id },
      data: {
        disposition: 'DESTROY',
        dispositionNotes: 'Destroyed - not eligible for restock',
        disposedBy: userId,
        disposedAt: new Date(),
      },
    });

    logger.info(
      `[InventoryReversal] Destroyed ${item.returnedQuantity} x ${item.medicine.name} from ${returnRecord.returnNumber}`
    );

    return {
      itemId: item.id,
      medicineName: item.medicine.name,
      disposition: 'DESTROY',
      quantity: item.returnedQuantity,
      success: true,
    };
  }

  async quarantineItem(returnRecord, item, userId) {
    await prisma.inventoryTransaction.create({
      data: {
        tenantId: returnRecord.tenantId,
        medicineId: item.medicineId,
        batchId: item.batchId,
        transactionType: 'QUARANTINE',
        quantityChange: 0,
        quantityAfter: 0,
        referenceType: 'RETURN_QUARANTINE',
        referenceId: returnRecord.id,
        performedBy: userId,
      },
    });

    await prisma.returnItem.update({
      where: { id: item.id },
      data: {
        disposition: 'QUARANTINE',
        dispositionNotes: 'Quarantined for inspection',
        disposedBy: userId,
        disposedAt: new Date(),
      },
    });

    logger.info(
      `[InventoryReversal] Quarantined ${item.returnedQuantity} x ${item.medicine.name} from ${returnRecord.returnNumber}`
    );

    return {
      itemId: item.id,
      medicineName: item.medicine.name,
      disposition: 'QUARANTINE',
      quantity: item.returnedQuantity,
      success: true,
    };
  }

  async supplierReturnItem(returnRecord, item, userId) {
    await prisma.returnItem.update({
      where: { id: item.id },
      data: {
        disposition: 'SUPPLIER_RETURN',
        dispositionNotes: 'Marked for supplier return',
        disposedBy: userId,
        disposedAt: new Date(),
      },
    });

    logger.info(
      `[InventoryReversal] Marked for supplier return: ${item.returnedQuantity} x ${item.medicine.name}`
    );

    return {
      itemId: item.id,
      medicineName: item.medicine.name,
      disposition: 'SUPPLIER_RETURN',
      quantity: item.returnedQuantity,
      success: true,
    };
  }

  requiresDestruction(medicine, returnReason) {
    if (returnReason === 'DAMAGED_RETURN' || returnReason === 'EXPIRED_RETURN') {
      return true;
    }

    const medicineName = (medicine.name || '').toUpperCase();
    return COLD_CHAIN_MEDICINES.some((type) => medicineName.includes(type));
  }

  async getPendingDispositions(tenantId) {
    return prisma.returnItem.findMany({
      where: {
        return: {
          tenantId,
          status: { in: ['APPROVED', 'REFUNDED'] },
        },
        disposition: 'PENDING',
      },
      include: {
        return: {
          select: { returnNumber: true, status: true },
        },
        medicine: {
          select: { name: true },
        },
        batch: {
          select: { batchNumber: true, expiryDate: true },
        },
      },
    });
  }
}

export { DISPOSITION_TYPES };
export default new InventoryReversalService();
