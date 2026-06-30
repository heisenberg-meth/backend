import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import supplierReturnRepository from '../repository/supplier-return.repository.js';
import movementService from '../../stock/service/movement.service.js';
import logger from '../../../shared/utils/logger.js';
import expiryService from '../../inventory/service/expiry.service.js';
import auditService from '../../audit/service/audit.prisma.service.js';

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
        select: { purchasePrice: true, expiryDate: true, availableQuantity: true, medicine: true },
      });
      if (!batch) throw new Error(`Batch ${item.batchId} not found`);

      const qty = Math.min(item.quantity, batch.availableQuantity);

      const purchasePrice = Number(batch.purchasePrice || 0);
      const subtotal = purchasePrice * qty;
      const gstPercentage = Number(batch.medicine?.gstPercentage || batch.medicine?.gst || 0);
      const gstAmount = (subtotal * gstPercentage) / 100;
      const totalAmount = subtotal + gstAmount;

      items.push({
        medicineId: item.medicineId,
        batchId: item.batchId,
        purchaseInvoiceItemId: item.purchaseInvoiceItemId || null,
        quantity: qty,
        expiryDate: batch.expiryDate,
        purchasePrice: purchasePrice,
        gstPercentage: gstPercentage,
        subtotal: subtotal,
        gstAmount: gstAmount,
        totalAmount: totalAmount,
        lossAmount: 0,
        reason: item.reason || data.reason,
      });
    }

    const returnRecord = await supplierReturnRepository.createReturn(
      {
        tenantId,
        supplierId: data.supplierId,
        purchaseInvoiceId: data.purchaseInvoiceId,
        returnNumber,
        notes: data.notes,
        reason: data.reason,
      },
      items,
      userId,
    );

    logger.info(`[SupplierReturn] Created return ${returnNumber} by user ${userId}`);

    redisClient.del(`supplier-return:dashboard:${tenantId}`).catch(() => {});

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

      auditService
        .log({
          tenantId,
          userId,
          action: 'SUPPLIER_RETURN_STATUS_CHANGED',
          target: returnRecord.returnNumber,
          targetType: 'SUPPLIER_RETURN',
          details: {
            returnId: id,
            from: returnRecord.status,
            to: status,
            returnAmount: returnRecord.returnAmount,
          },
        })
        .catch(() => {});

      redisClient.del(`supplier-return:dashboard:${tenantId}`).catch(() => {});

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

  async updateDispatchStatus(id, tenantId, dispatchStatus) {
    const validStatuses = [
      'PENDING',
      'READY_TO_SEND',
      'SENT_TO_SUPPLIER',
      'RECEIVED_BY_SUPPLIER',
      'CREDIT_NOTE_RECEIVED',
    ];
    if (!validStatuses.includes(dispatchStatus)) {
      throw new Error(`Invalid dispatch status: ${dispatchStatus}`);
    }

    const returnRecord = await supplierReturnRepository.findReturnById(id, tenantId);
    if (!returnRecord) throw new Error('Return not found');

    const updated = await supplierReturnRepository.updateDispatchStatus(
      id,
      tenantId,
      dispatchStatus,
    );

    auditService
      .log({
        tenantId,
        action: 'SUPPLIER_RETURN_DISPATCH_STATUS_CHANGED',
        target: returnRecord.returnNumber,
        targetType: 'SUPPLIER_RETURN',
        details: {
          returnId: id,
          from: returnRecord.dispatchStatus,
          to: dispatchStatus,
        },
      })
      .catch(() => {});

    redisClient.del(`supplier-return:dashboard:${tenantId}`).catch(() => {});

    if (dispatchStatus === 'CREDIT_NOTE_RECEIVED' && returnRecord.returnAmount > 0) {
      const existingCreditNotes = await prisma.supplierCreditNote.findFirst({
        where: { returnId: id },
      });
      if (!existingCreditNotes) {
        const creditNote = await supplierReturnRepository.createCreditNote(id, {
          amount: returnRecord.returnAmount,
          notes: 'Auto-generated on credit note received from supplier',
        });

        auditService
          .log({
            tenantId,
            action: 'SUPPLIER_RETURN_CREDIT_NOTE_AUTO_GENERATED',
            target: returnRecord.returnNumber,
            targetType: 'SUPPLIER_RETURN',
            details: {
              returnId: id,
              creditNoteId: creditNote.id,
              amount: returnRecord.returnAmount,
            },
          })
          .catch(() => {});
      }
    }

    return updated;
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

  async getDashboardMetrics(tenantId) {
    const cacheKey = `supplier-return:dashboard:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [pending, readyToSend, sent, received, creditReceived, totalReturns, totalCreditNotes] =
      await Promise.all([
        prisma.supplierReturn.count({ where: { tenantId, dispatchStatus: 'PENDING' } }),
        prisma.supplierReturn.count({ where: { tenantId, dispatchStatus: 'READY_TO_SEND' } }),
        prisma.supplierReturn.count({ where: { tenantId, dispatchStatus: 'SENT_TO_SUPPLIER' } }),
        prisma.supplierReturn.count({
          where: { tenantId, dispatchStatus: 'RECEIVED_BY_SUPPLIER' },
        }),
        prisma.supplierReturn.count({
          where: { tenantId, dispatchStatus: 'CREDIT_NOTE_RECEIVED' },
        }),
        prisma.supplierReturn.count({ where: { tenantId } }),
        prisma.supplierCreditNote.count({ where: { tenantId } }),
      ]);

    const totalReturnValue = await prisma.supplierReturn.aggregate({
      where: { tenantId },
      _sum: { returnAmount: true },
    });

    const totalCreditNoteAmount = await prisma.supplierCreditNote.aggregate({
      where: { tenantId },
      _sum: { amount: true },
    });

    const result = {
      pending,
      readyToSend,
      sent,
      received,
      creditReceived,
      totalReturns,
      totalReturnValue: Number(totalReturnValue._sum.returnAmount || 0),
      totalCreditNotes,
      totalCreditNoteAmount: Number(totalCreditNoteAmount._sum.amount || 0),
    };

    await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }
}

export default new SupplierReturnService();
