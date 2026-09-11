import ledgerService from '../../vendors/services/ledger.service.js';
import prisma from '../../../config/prisma.js';
import cacheInvalidatorService from '../../inventory/service/cache-invalidator.service.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnService {
  async createReturn(tenantId, data, userId) {
    const { items, supplierId, purchaseInvoiceId, reason } = data;

    if (!purchaseInvoiceId) throw new Error('Purchase Invoice ID is required');
    if (!supplierId) throw new Error('Supplier ID is required');
    if (!items || !items.length) throw new Error('Return items are required');

    return await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
      });

      if (!invoice || invoice.tenantId !== tenantId) {
        throw new Error('Purchase invoice not found');
      }

      let totalReturnAmount = 0;
      const returnItemsData = [];

      for (const item of items) {
        const batch = await tx.inventoryBatch.findUnique({ where: { id: item.batchId } });
        if (!batch) throw new Error(`Batch ${item.batchId} not found`);

        if (item.quantity > batch.quantity) {
          throw new Error(`Return quantity exceeds available stock for batch ${batch.batchNumber}`);
        }

        const itemAmount = item.quantity * Number(batch.purchasePrice || 0);
        totalReturnAmount += itemAmount;

        returnItemsData.push({
          medicineId: batch.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          purchasePrice: batch.purchasePrice,
          lossAmount: 0,
          reason,
        });
      }

      const returnNumber = `RET-${Date.now()}`;

      const returnRecord = await tx.supplierReturn.create({
        data: {
          tenantId,
          supplierId,
          purchaseInvoiceId,
          returnNumber,
          returnAmount: totalReturnAmount,
          status: 'DRAFT',
          reason,
          createdBy: userId,
          items: { create: returnItemsData },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'SUPPLIER_RETURN_CREATED',
          target: `SupplierReturn:${returnRecord.id}`,
          type: 'INVENTORY',
        },
      });

      return returnRecord;
    });
  }

  async approveReturn(tenantId, returnId, userId) {
    const returnRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.supplierReturn.findUnique({
        where: { id: returnId },
        include: { items: true },
      });

      if (!record || record.tenantId !== tenantId) throw new Error('Return not found');
      if (record.status !== 'DRAFT')
        throw new Error(`Cannot approve return in ${record.status} status`);

      for (const item of record.items) {
        const batch = await tx.inventoryBatch.findUnique({ where: { id: item.batchId } });
        if (!batch) throw new Error(`Batch ${item.batchId} not found`);

        const avail = batch.availableQuantity != null ? batch.availableQuantity : batch.quantity;
        if (item.quantity > avail) {
          throw new Error(
            `Return quantity (${item.quantity}) exceeds available stock for batch ${batch.batchNumber}`,
          );
        }

        await tx.inventoryBatch.update({
          where: { id: item.batchId },
          data: {
            quantity: { decrement: item.quantity },
            availableQuantity: { decrement: item.quantity },
          },
        });

        await tx.inventory.update({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              medicineId: item.medicineId,
              branchId: batch.branchId,
            },
          },
          data: { currentStock: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: batch.branchId,
            medicineId: item.medicineId,
            batchId: item.batchId,
            movementType: 'SUPPLIER_RETURN',
            quantity: -item.quantity,
            quantityBefore: batch.availableQuantity,
            quantityAfter: batch.availableQuantity - item.quantity,
            referenceType: 'SUPPLIER_RETURN',
            referenceId: returnId,
            idempotencyKey: `supplier-return:${returnId}:${item.id || item.batchId}`,
            performedBy: userId,
            notes: record.reason || 'SUPPLIER_RETURN',
          },
        });
      }

      await tx.supplierReturn.update({
        where: { id: returnId },
        data: { status: 'APPROVED' },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'SUPPLIER_RETURN_APPROVED',
          target: `SupplierReturn:${returnId}`,
          type: 'INVENTORY',
        },
      });

      return record;
    });

    try {
      const medicineIds = returnRecord.items?.map((i) => i.medicineId).filter(Boolean) || [];
      const branchId = returnRecord.items?.[0]?.batch?.branchId || null;
      await cacheInvalidatorService.invalidateInventoryCaches(tenantId, medicineIds, branchId);
    } catch (cacheErr) {
      logger.warn({ err: cacheErr, tenantId }, 'PURCHASE_RETURN_CACHE_INVALIDATION_FAILED');
    }

    return returnRecord;
  }

  async dispatchReturn(tenantId, returnId, userId) {
    const returnRecord = await prisma.supplierReturn.findFirst({
      where: { id: returnId, tenantId },
    });
    if (!returnRecord) throw new Error('Return not found');
    if (returnRecord.status !== 'APPROVED')
      throw new Error(`Cannot dispatch return in ${returnRecord.status} status`);

    await prisma.supplierReturn.update({
      where: { id: returnId },
      data: { status: 'DISPATCHED' },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'SUPPLIER_RETURN_DISPATCHED',
        target: `SupplierReturn:${returnId}`,
        type: 'INVENTORY',
      },
    });

    return returnRecord;
  }

  async receiveReturn(tenantId, returnId) {
    const returnRecord = await prisma.supplierReturn.findFirst({
      where: { id: returnId, tenantId },
    });
    if (!returnRecord) throw new Error('Return not found');
    if (returnRecord.status !== 'DISPATCHED')
      throw new Error(`Cannot mark received for return in ${returnRecord.status} status`);

    await prisma.supplierReturn.update({
      where: { id: returnId },
      data: { status: 'RECEIVED' },
    });

    return returnRecord;
  }

  async completeReturn(tenantId, returnId, userId) {
    return await prisma.$transaction(async (tx) => {
      const returnRecord = await tx.supplierReturn.findUnique({
        where: { id: returnId },
        include: { items: true },
      });

      if (!returnRecord || returnRecord.tenantId !== tenantId) throw new Error('Return not found');
      if (returnRecord.status !== 'RECEIVED')
        throw new Error(`Cannot complete return in ${returnRecord.status} status`);

      await ledgerService.recordEntry(
        tenantId,
        {
          supplierId: returnRecord.supplierId,
          type: 'RETURN',
          creditAmount: Number(returnRecord.returnAmount),
          referenceType: 'SUPPLIER_RETURN',
          referenceId: returnId,
          notes: `Return ${returnRecord.returnNumber} completed`,
        },
        tx,
      );

      const creditNoteNumber = `CN-${returnRecord.returnNumber.replace('RET-', '')}`;
      await tx.supplierCreditNote.create({
        data: {
          tenantId,
          supplierId: returnRecord.supplierId,
          returnId: returnRecord.id,
          creditNoteNumber,
          amount: Number(returnRecord.returnAmount),
          remainingAmount: Number(returnRecord.returnAmount),
          status: 'ISSUED',
          createdBy: userId,
        },
      });

      await tx.supplierReturn.update({
        where: { id: returnId },
        data: { status: 'COMPLETED' },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'SUPPLIER_RETURN_COMPLETED',
          target: `SupplierReturn:${returnId}`,
          type: 'INVENTORY',
        },
      });

      return returnRecord;
    });
  }

  async processReturn(tenantId, data, userId) {
    const result = await this.createReturn(tenantId, data, userId);
    await this.approveReturn(tenantId, result.id, userId);
    await this.dispatchReturn(tenantId, result.id, userId);
    await this.receiveReturn(tenantId, result.id);
    return this.completeReturn(tenantId, result.id, userId);
  }

  async getReturns(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [returns, total] = await Promise.all([
      prisma.supplierReturn.findMany({
        where: { tenantId },
        include: {
          supplier: {
            select: { id: true, name: true, phone: true },
          },
          items: {
            include: {
              medicine: true,
              batch: true,
            },
          },
          batch: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              medicine: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierReturn.count({ where: { tenantId } }),
    ]);

    const normalizedReturns = returns.map((ret) => {
      if (ret.items && ret.items.length > 0) return ret;
      if (ret.batchId) {
        return {
          ...ret,
          items: [
            {
              medicine: ret.batch?.medicine,
              batch: ret.batch,
              quantity: ret.quantity,
              purchasePrice: ret.returnAmount,
              reason: ret.reason,
            },
          ],
        };
      }
      return { ...ret, items: [] };
    });

    return {
      returns: normalizedReturns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getReturnById(tenantId, returnId) {
    const returnRecord = await prisma.supplierReturn.findUnique({
      where: { id: returnId },
      include: {
        supplier: true,
        items: {
          include: { medicine: true, batch: true },
        },
        batch: {
          include: { medicine: true },
        },
      },
    });

    if (!returnRecord || returnRecord.tenantId !== tenantId) {
      throw new Error('Supplier return not found');
    }

    if (!returnRecord.items || returnRecord.items.length === 0) {
      if (returnRecord.batchId) {
        returnRecord.items = [
          {
            medicine: returnRecord.batch?.medicine,
            batch: returnRecord.batch,
            quantity: returnRecord.quantity,
            purchasePrice: returnRecord.returnAmount,
            reason: returnRecord.reason,
          },
        ];
      } else {
        returnRecord.items = [];
      }
    }

    return returnRecord;
  }
}

export default new SupplierReturnService();
