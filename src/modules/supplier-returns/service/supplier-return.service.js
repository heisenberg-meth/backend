import prisma from '../../../config/prisma.js';
import supplierReturnRepository from '../repository/supplier-return.repository.js';
import movementService from '../../stock/service/movement.service.js';
import logger from '../../../shared/utils/logger.js';
import expiryService from '../../inventory/service/expiry.service.js';

class SupplierReturnService {
  async getExpiredGroupedBySupplier(tenantId) {
    const expiredBatches = await expiryService.getBatchesByBucket(tenantId, 'EXPIRED', null, {
      supplierId: { not: null },
    });

    const grouped = {};
    for (const batch of expiredBatches) {
      const sid = batch.supplierId;
      if (!grouped[sid]) {
        grouped[sid] = {
          supplier: batch.supplier,
          items: [],
          totalQty: 0,
          totalLoss: 0,
          itemCount: 0,
        };
      }
      grouped[sid].items.push(batch);
      grouped[sid].totalQty += batch.quantity;
      grouped[sid].totalLoss += Number(batch.purchasePrice) * batch.quantity;
      grouped[sid].itemCount++;
    }
    return Object.values(grouped);
  }

  async createReturn(tenantId, data, userId) {
    const returnNumber = await supplierReturnRepository.generateReturnNumber(tenantId);

    const items = [];
    for (const item of data.items) {
      if (!item.batchId) {
        throw new Error('Batch ID is required for each return item');
      }
      const batch = await prisma.inventoryBatch.findUnique({
        where: { id: item.batchId },
        select: { purchasePrice: true, expiryDate: true, availableQuantity: true },
      });
      if (!batch) throw new Error(`Batch ${item.batchId} not found`);

      const qty = Math.min(item.quantity, batch.availableQuantity);
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

    return prisma.$transaction(async (tx) => {
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

        for (const item of items) {
          if (item.batchId && item.quantity) {
            // Get branchId from the batch if not directly available
            let branchId = returnRecord.branchId;
            if (!branchId && item.batch) {
              branchId = item.batch.branchId;
            }

            await movementService.recordMovement(
              tenantId,
              {
                medicineId: item.medicineId || returnRecord.medicineId,
                batchId: item.batchId,
                branchId: branchId || null,
                movementType: 'SUPPLIER_RETURN',
                quantity: -item.quantity, // Negative for deduction
                referenceType: 'SUPPLIER_RETURN',
                referenceId: id,
                notes: 'Supplier Return - Approved',
              },
              userId,
              tx,
            );
          }
        }

        const totalReturnAmount = Number(returnRecord.returnAmount || 0);
        if (totalReturnAmount > 0) {
          await supplierReturnRepository.recordLedgerEntry(
            tenantId,
            returnRecord.supplierId,
            'CREDIT',
            totalReturnAmount,
            'SUPPLIER_RETURN',
            id,
            `Supplier return ${returnRecord.returnNumber}`,
            tx,
          );
        }
      }

      if (status === 'COMPLETED') {
        const creditData = {
          amount: returnRecord.returnAmount || 0,
          notes: 'Auto-generated on completion',
        };
        await supplierReturnRepository.createCreditNote(id, creditData, tx);
      }

      const updated = await supplierReturnRepository.updateReturnStatus(
        id,
        tenantId,
        status,
        userId,
        tx,
      );
      logger.info(
        `[SupplierReturn] ${returnRecord.returnNumber} status: ${returnRecord.status} -> ${status}`,
      );
      return updated;
    });
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
    const expired = await expiryService.getBatchesByBucket(tenantId, 'EXPIRED');

    const supplierIds = new Set();
    let totalValue = 0;
    let totalUnits = 0;
    for (const b of expired) {
      totalValue += Number(b.purchasePrice) * b.availableQuantity;
      totalUnits += b.availableQuantity;
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
