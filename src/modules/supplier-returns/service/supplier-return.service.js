import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import supplierReturnRepository from '../repository/supplier-return.repository.js';
import logger from '../../../shared/utils/logger.js';
import expiryService from '../../inventory/service/expiry.service.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import cacheInvalidatorService from '../../inventory/service/cache-invalidator.service.js';

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
      const batch = await prisma.inventoryBatch.findFirst({
        where: {
          id: item.batchId,
          ...(tenantId ? { tenantId } : {}),
        },
        include: {
          medicine: true,
        },
      });
      if (!batch) throw new Error(`Batch ${item.batchId} not found`);

      if (item.quantity <= 0) {
        throw new Error('Return quantity must be greater than 0');
      }

      if (item.quantity > batch.availableQuantity) {
        throw new Error(
          `Requested return quantity (${item.quantity}) exceeds available stock (${batch.batchNumber})`,
        );
      }

      if (!data.purchaseInvoiceId && batch.purchaseInvoiceId) {
        data.purchaseInvoiceId = batch.purchaseInvoiceId;
      }

      if (!data.supplierId && batch.supplierId) {
        data.supplierId = batch.supplierId;
      }

      const qty = item.quantity;

      const purchasePrice = Number(batch.purchasePrice || 0);
      const subtotal = purchasePrice * qty;
      const gstPercentage = Number(batch.medicine?.gstPercentage || batch.medicine?.gst || 0);
      const gstAmount = (subtotal * gstPercentage) / 100;
      const totalAmount = subtotal + gstAmount;

      items.push({
        medicineId: item.medicineId || batch.medicineId || batch.medicine?.id,
        batchId: item.batchId,
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
      DRAFT: ['PENDING', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      PENDING: ['APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['PICKED_UP', 'COMPLETED', 'REJECTED', 'CANCELLED'],
      PICKED_UP: ['COMPLETED', 'REJECTED', 'CANCELLED'],
      COMPLETED: [],
      REJECTED: [],
      CANCELLED: [],
    };

    const returnRecord = await supplierReturnRepository.findReturnById(id, tenantId);
    if (!returnRecord) throw new Error('Return not found');

    const allowed = validTransitions[returnRecord.status];
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`Cannot transition from ${returnRecord.status} to ${status}`);
    }

    let inventoryImpact = [];

    const updated = await prisma.$transaction(async (tx) => {
      // Inventory stock mutation strictly upon COMPLETED
      if (status === 'COMPLETED') {
        const items =
          returnRecord.items?.length > 0
            ? returnRecord.items
            : returnRecord.batchId
              ? [
                  {
                    batchId: returnRecord.batchId,
                    medicineId: returnRecord.medicineId,
                    quantity: returnRecord.quantity,
                    reason: returnRecord.reason,
                  },
                ]
              : [];

        // Check if stock deduction was already performed for this return (Idempotency)
        const existingMovement = await tx.stockMovement.findFirst({
          where: {
            tenantId,
            referenceType: 'SUPPLIER_RETURN',
            referenceId: id,
          },
        });

        if (!existingMovement) {
          for (const item of items) {
            if (!item.batchId || !item.quantity || item.quantity <= 0) continue;

            const batch = await tx.inventoryBatch.findFirst({
              where: {
                id: item.batchId,
                tenantId,
                deletedAt: null,
              },
              include: {
                medicine: true,
              },
            });

            if (!batch) {
              const err = new Error(`Batch ${item.batchId} not found`);
              err.statusCode = 404;
              throw err;
            }

            if (batch.availableQuantity < item.quantity) {
              const err = new Error(
                `Cannot return ${item.quantity} units. Only ${batch.availableQuantity} units are available in batch ${batch.batchNumber}.`,
              );
              err.statusCode = 400;
              err.code = 'INSUFFICIENT_STOCK';
              throw err;
            }

            // Decrement batch availableQuantity and quantity
            await tx.inventoryBatch.update({
              where: { id: item.batchId },
              data: {
                quantity: { decrement: item.quantity },
                availableQuantity: { decrement: item.quantity },
              },
            });

            // Decrement branch inventory
            const resolvedBranchId =
              returnRecord.branchId || item.batch?.branchId || batch.branchId || null;

            if (resolvedBranchId) {
              const existingInventory = await tx.inventory.findFirst({
                where: {
                  tenantId,
                  branchId: resolvedBranchId,
                  medicineId: item.medicineId || batch.medicineId,
                },
              });
              if (existingInventory) {
                await tx.inventory.update({
                  where: { id: existingInventory.id },
                  data: {
                    currentStock: { decrement: item.quantity },
                  },
                });
              }
            }

            // Record stock movement ledger entry
            await tx.stockMovement.create({
              data: {
                tenantId,
                branchId: resolvedBranchId,
                medicineId: item.medicineId || batch.medicineId,
                batchId: item.batchId,
                movementType: 'SUPPLIER_RETURN',
                quantity: -item.quantity,
                quantityBefore: batch.availableQuantity,
                quantityAfter: batch.availableQuantity - item.quantity,
                referenceType: 'SUPPLIER_RETURN',
                referenceId: id,
                idempotencyKey: `supplier-return:${id}:${item.id || item.batchId}`,
                performedBy: userId,
                notes: item.reason || returnRecord.reason || 'Supplier Return - Completed',
              },
            });

            inventoryImpact.push({
              medicineId: item.medicineId || batch.medicineId,
              medicineName: batch.medicine?.name || item.medicine?.name || 'Medicine',
              batchId: item.batchId,
              batchNumber: batch.batchNumber,
              quantityReturned: item.quantity,
              remainingQuantity: batch.availableQuantity - item.quantity,
            });
          }
        }

        // Auto-generate credit note if needed and not already exists
        const totalReturnAmount = Number(returnRecord.returnAmount || 0);
        if (totalReturnAmount > 0) {
          const existingNote = await tx.supplierCreditNote.findFirst({
            where: { returnId: id },
          });
          if (!existingNote) {
            const creditData = {
              amount: totalReturnAmount,
              notes: 'Auto-generated on completion',
            };
            await supplierReturnRepository.createCreditNote(id, creditData, tx);
          }

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

      const updatedRecord = await supplierReturnRepository.updateReturnStatus(
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

      return updatedRecord;
    });

    if (status === 'COMPLETED') {
      const medicineIds = (returnRecord.items || [])
        .map((i) => i.medicineId || i.batch?.medicineId)
        .filter(Boolean);
      if (returnRecord.medicineId && !medicineIds.includes(returnRecord.medicineId)) {
        medicineIds.push(returnRecord.medicineId);
      }
      const branchId = returnRecord.branchId || returnRecord.items?.[0]?.batch?.branchId || null;
      try {
        await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineIds, branchId);
      } catch (cacheErr) {
        logger.warn({ err: cacheErr, tenantId }, 'SUPPLIER_RETURN_CACHE_INVALIDATION_FAILED');
      }
    }

    return {
      ...updated,
      inventoryImpact,
    };
  }

  async completeReturn(id, tenantId, userId) {
    return this.updateStatus(id, tenantId, 'COMPLETED', userId);
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
