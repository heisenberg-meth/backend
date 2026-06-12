import prisma from '../../../config/prisma.js';
import supplierReturnRepository from '../repository/supplier-return.repository.js';
import movementService from '../../stock/service/movement.service.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnService {
  async getExpiredGroupedBySupplier(tenantId) {
    return supplierReturnRepository.findExpiredBatchesGroupedBySupplier(tenantId);
  }

  async createReturn(tenantId, data, userId) {
    const returnNumber = await supplierReturnRepository.generateReturnNumber(tenantId);

    const items = [];
    for (const item of data.items) {
      const batch = await prisma.inventoryBatch.findUnique({
        where: { id: item.batchId },
        select: { purchasePrice: true, expiryDate: true, quantity: true },
      });
      if (!batch) throw new Error(`Batch ${item.batchId} not found`);

      const qty = Math.min(item.quantity, batch.quantity);
      const loss = Number(batch.purchasePrice) * qty;

      items.push({
        medicineId: item.medicineId,
        batchId: item.batchId,
        quantity: qty,
        expiryDate: batch.expiryDate,
        purchasePrice: batch.purchasePrice,
        lossAmount: loss,
        reason: item.reason || data.reason,
      });
    }

    const returnRecord = await supplierReturnRepository.createReturn(
      { tenantId, supplierId: data.supplierId, returnNumber, notes: data.notes },
      items,
      userId,
    );

    logger.info(`[SupplierReturn] Created return ${returnNumber} by user ${userId}`);

    return returnRecord;
  }

  async listReturns(tenantId, query) {
    return supplierReturnRepository.findReturns(tenantId, query);
  }

  async getReturnDetail(id, tenantId) {
    const returnRecord = await supplierReturnRepository.findReturnById(id, tenantId);
    if (!returnRecord) throw new Error('Return not found');
    return returnRecord;
  }

  async updateStatus(id, tenantId, status, userId) {
    const validTransitions = {
      DRAFT: ['PENDING', 'REJECTED'],
      PENDING: ['APPROVED', 'REJECTED'],
      APPROVED: ['PICKED_UP', 'REJECTED'],
      PICKED_UP: ['COMPLETED', 'REJECTED'],
    };

    const returnRecord = await supplierReturnRepository.findReturnById(id, tenantId);
    if (!returnRecord) throw new Error('Return not found');

    const allowed = validTransitions[returnRecord.status];
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`Cannot transition from ${returnRecord.status} to ${status}`);
    }

    if (status === 'APPROVED') {
      const items =
        returnRecord.items?.length > 0
          ? returnRecord.items
          : [
              {
                batchId: returnRecord.batchId,
                medicineId: returnRecord.medicineId,
                quantity: returnRecord.quantity,
              },
            ];

      const movements = [];
      for (const item of items) {
        if (item.batchId && item.quantity) {
          try {
            const movement = await movementService.stockOut(tenantId, {
              medicineId: item.medicineId || returnRecord.medicineId,
              batchId: item.batchId,
              quantity: item.quantity,
              branchId: null,
              referenceType: 'SUPPLIER_RETURN',
              reason: 'Supplier Return - Approved',
            });
            movements.push(movement);

            await supplierReturnRepository.recordLedgerEntry(
              tenantId,
              returnRecord.supplierId,
              'CREDIT',
              Number(returnRecord.returnAmount || 0),
              'SUPPLIER_RETURN',
              id,
              `Supplier return ${returnRecord.returnNumber}`,
              null,
            );
          } catch (err) {
            logger.error(
              { err, batchId: item.batchId },
              'Failed to process stock out for return item',
            );
          }
        }
      }
    }

    if (status === 'COMPLETED') {
      const creditData = {
        amount: returnRecord.returnAmount || 0,
        notes: 'Auto-generated on completion',
      };
      await supplierReturnRepository.createCreditNote(id, creditData);
    }

    const updated = await supplierReturnRepository.updateReturnStatus(id, tenantId, status, userId);
    logger.info(
      `[SupplierReturn] ${returnRecord.returnNumber} status: ${returnRecord.status} -> ${status}`,
    );
    return updated;
  }

  async generateCreditNote(returnId, data) {
    const creditNote = await supplierReturnRepository.createCreditNote(returnId, data);
    logger.info(
      `[SupplierReturn] Credit note ${creditNote.creditNoteNumber} generated for return ${returnId}`,
    );
    return creditNote;
  }

  async listCreditNotes(tenantId, query) {
    return supplierReturnRepository.findCreditNotes(tenantId, query);
  }

  async getInwardTransactions(supplierId, tenantId, query) {
    return supplierReturnRepository.getSupplierInwardTransactions(supplierId, tenantId, query);
  }

  async getReturnTransactions(supplierId, tenantId, query) {
    return supplierReturnRepository.getSupplierReturnTransactions(supplierId, tenantId, query);
  }

  async getSupplierLedger(supplierId, tenantId, query) {
    return supplierReturnRepository.getSupplierLedger(supplierId, tenantId, query);
  }

  async getExpiredInventorySummary(tenantId) {
    const expired = await prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        expiryDate: { lt: new Date() },
        deletedAt: null,
        quantity: { gt: 0 },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        medicine: { select: { id: true, name: true, genericName: true } },
      },
    });

    const supplierIds = new Set();
    let totalValue = 0;
    let totalUnits = 0;
    for (const b of expired) {
      totalValue += Number(b.purchasePrice) * b.quantity;
      totalUnits += b.quantity;
      if (b.supplierId) supplierIds.add(b.supplierId);
    }

    return {
      totalExpiredProducts: expired.length,
      totalUnits,
      inventoryValue: totalValue,
      suppliersInvolved: supplierIds.size,
      items: expired,
    };
  }
}

export default new SupplierReturnService();
