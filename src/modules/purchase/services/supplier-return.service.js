import ledgerService from '../../vendors/services/ledger.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnService {
  async processReturn(tenantId, data, userId) {
    const { items, supplierId, purchaseInvoiceId, reason } = data;

    if (!purchaseInvoiceId) throw new Error('Purchase Invoice ID is required');
    if (!supplierId) throw new Error('Supplier ID is required');
    if (!items || !items.length) throw new Error('Return items are required');

    return await prisma.$transaction(async (tx) => {
      // Validate Purchase Invoice Status
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
        include: {
          purchaseOrder: true,
        },
      });

      if (!invoice || invoice.tenantId !== tenantId) {
        throw new Error('Purchase invoice not found');
      }

      const batches = await tx.inventoryBatch.findMany({
        where: {
          OR: [{ purchaseInvoiceId }, { id: { in: items.map((x) => x.batchId) } }],
        },
      });
      invoice.inventoryBatches = batches;

      const invoiceStatus = invoice.purchaseOrder?.status || 'RECEIVED';
      if (invoiceStatus !== 'RECEIVED' && invoiceStatus !== 'PARTIALLY_RECEIVED') {
        throw new Error(
          `Invoice status is ${invoiceStatus}. Only RECEIVED invoices can be returned`,
        );
      }

      if (!invoice.inventoryBatches || invoice.inventoryBatches.length === 0) {
        console.error({
          invoiceId: purchaseInvoiceId,
          batchCount: batches ? batches.length : 0,
          purchaseInvoiceId,
        });
        throw new Error(
          'This invoice has no linked inventory batches.\nPlease contact administrator.',
        );
      }

      // Validate Supplier Existence
      const supplier = await tx.supplier.findUnique({
        where: { id: supplierId },
      });

      if (!supplier || supplier.tenantId !== tenantId) {
        throw new Error('Supplier not found');
      }

      let totalReturnAmount = 0;
      let totalGstAmount = 0;
      const returnItemsData = [];

      for (const item of items) {
        // Validate Batch Mapping
        const batch = await tx.inventoryBatch.findUnique({
          where: { id: item.batchId },
        });

        if (!batch) throw new Error(`Batch ${item.batchId} not found`);
        if (batch.quantity <= 0) throw new Error(`Batch ${item.batchId} is empty`);

        // Get original invoice batch to check received qty
        const invBatch = invoice.inventoryBatches.find((i) => i.id === batch.id);
        if (!invBatch) throw new Error(`Batch ${batch.id} not found in invoice`);

        // Validate Previously Returned Quantity for THIS batch
        const previousReturns = await tx.supplierReturnItem.aggregate({
          where: {
            return: { purchaseInvoiceId },
            batchId: batch.id,
          },
          _sum: { quantity: true },
        });

        const alreadyReturnedQty = previousReturns._sum.quantity || 0;
        const availableQty = invBatch.receivedQuantity - alreadyReturnedQty;

        // Validate Return Quantities
        if (item.quantity > availableQty) {
          throw new Error(
            `Return quantity (${item.quantity}) exceeds available quantity (${availableQty}) for medicine ${batch.medicineId}`,
          );
        }

        // Amount Calculations
        const itemAmount = item.quantity * Number(invBatch.purchasePrice || 0);
        // GST Reversal (Defaulting to 0 since InventoryBatch has no gstPercentage)
        const itemGst = (itemAmount * Number(invBatch.gstPercentage || 0)) / 100;

        totalReturnAmount += itemAmount;
        totalGstAmount += itemGst;

        returnItemsData.push({
          medicineId: batch.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          purchasePrice: invBatch.purchasePrice,
          lossAmount: 0,
          reason,
        });

        // Inventory Rollback
        await tx.inventoryBatch.update({
          where: { id: item.batchId },
          data: { quantity: { decrement: item.quantity } },
        });

        await tx.inventory.update({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              medicineId: batch.medicineId,
              branchId: batch.branchId,
            },
          },
          data: { currentStock: { decrement: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: batch.branchId,
            medicineId: batch.medicineId,
            batchId: item.batchId,
            movementType: 'SUPPLIER_RETURN',
            quantity: item.quantity,
            referenceType: 'PURCHASE_INVOICE',
            referenceId: purchaseInvoiceId,
            performedBy: userId,
            notes: reason || 'SUPPLIER_RETURN',
          },
        });
      }

      const returnNumber = `RET-${Date.now()}`;

      const returnRecord = await tx.supplierReturn.create({
        data: {
          tenantId,
          supplierId,
          purchaseInvoiceId,
          returnNumber,
          returnAmount: totalReturnAmount + totalGstAmount,
          status: 'COMPLETED',
          reason,
          createdBy: userId,
          items: {
            create: returnItemsData,
          },
        },
      });

      // Supplier Ledger Adjustment
      await ledgerService.recordEntry(
        tenantId,
        {
          supplierId,
          type: 'RETURN',
          creditAmount: totalReturnAmount + totalGstAmount,
          debitAmount: 0,
          referenceType: 'SUPPLIER_RETURN',
          referenceId: returnRecord.id,
          notes: `Return for invoice ${invoice.invoiceNumber}`,
          createdBy: userId,
        },
        tx,
      );

      // Audit Trail
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'PURCHASE_RETURN_CREATED',
          target: 'SupplierReturn',
          type: 'INVENTORY',
        },
      });

      logger.info(
        `[SupplierReturn] Processed return ${returnRecord.id} for invoice ${purchaseInvoiceId}`,
      );
      return returnRecord;
    });
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

    return {
      returns,
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
        batch: {
          include: { medicine: true },
        },
      },
    });

    if (!returnRecord || returnRecord.tenantId !== tenantId) {
      throw new Error('Supplier return not found');
    }

    return returnRecord;
  }
}

export default new SupplierReturnService();
