import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';
import movementService from '../../stock/service/movement.service.js';
import ledgerService from '../../vendors/services/ledger.service.js';
import logger from '../../../shared/utils/logger.js';

class StockInService {
  async receiveGoods(tenantId, data, userId) {
    const {
      purchaseOrderId,
      supplierId,
      supplierInvoiceNumber,
      invoiceDate,
      items,
      receivedItems,
      notes,
    } = data;

    // Support both `items` and `receivedItems` for backward compatibility
    const itemsToProcess = items || receivedItems;

    // 1. Validate PO exists and is in receivable status
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!po) throw new Error('Purchase Order not found');
    if (
      !['APPROVED', 'SENT_TO_SUPPLIER', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(po.status)
    ) {
      throw new Error(`PO status ${po.status} does not allow receiving`);
    }

    // 2. Create GRN
    const grnCount = await prisma.goodsReceiptNote.count({
      where: { tenantId, purchaseOrderId },
    });
    const grnNumber = `GRN-${po.orderNumber}-${String(grnCount + 1).padStart(3, '0')}`;

    const grn = await prisma.goodsReceiptNote.create({
      data: {
        tenantId,
        purchaseOrderId,
        grnNumber,
        supplierInvoiceNumber,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        receivedBy: userId,
        notes,
      },
    });

    let totalAmount = 0;

    // 3. Process each received item
    for (const item of itemsToProcess) {
      const poItem = po.items.find((i) => i.id === item.purchaseOrderItemId);
      if (!poItem) throw new Error(`PO Item ${item.purchaseOrderItemId} not found`);

      const remaining = poItem.quantity - poItem.receivedQuantity;
      if (item.receivedQuantity > remaining) {
        throw new Error(
          `Received quantity ${item.receivedQuantity} exceeds remaining ${remaining} for ${poItem.medicineName}`,
        );
      }

      // 4. Create GRN Item
      await prisma.goodsReceiptNoteItem.create({
        data: {
          grnId: grn.id,
          purchaseOrderItemId: item.purchaseOrderItemId,
          medicineId: poItem.medicineId,
          receivedQuantity: item.receivedQuantity,
          batchNumber: item.batchNumber,
          manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          purchasePrice: item.purchasePrice,
          mrp: item.mrp,
          sellingPrice: item.sellingPrice,
        },
      });

      // 5. Update PO item received/remaining quantities
      const newReceived = poItem.receivedQuantity + item.receivedQuantity;
      await prisma.purchaseOrderItem.update({
        where: { id: item.purchaseOrderItemId },
        data: {
          receivedQuantity: newReceived,
          remainingQuantity: poItem.quantity - newReceived,
        },
      });

      // 6. Create inventory batch and stock movement
      await movementService.stockIn(
        tenantId,
        {
          medicineId: poItem.medicineId,
          batchNumber: item.batchNumber,
          quantity: item.receivedQuantity,
          expiryDate: item.expiryDate,
          manufacturingDate: item.manufacturingDate,
          purchasePrice: item.purchasePrice,
          sellingPrice: item.sellingPrice,
          branchId: po.branchId,
          supplierId,
          referenceType: 'GRN',
          referenceId: grn.id,
        },
        userId,
      );

      totalAmount +=
        item.receivedQuantity * (Number(item.purchasePrice) || Number(poItem.unitPrice));
    }

    // 7. Create Purchase Invoice
    // FIX #05: Replace COUNT+1 race condition with atomic sequenceService
    // sequenceService uses PostgreSQL INSERT ... ON CONFLICT DO UPDATE RETURNING — guaranteed unique
    const seq = await sequenceService.getNextValue(tenantId, 'PURCHASE_INVOICE');
    const invoiceNumber = `PINV-${String(seq).padStart(5, '0')}`;

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        tenantId,
        supplierId,
        purchaseOrderId,
        invoiceNumber,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        subtotal: totalAmount,
        gstAmount: 0,
        totalAmount,
        balanceAmount: totalAmount,
        paidAmount: 0,
        paymentStatus: 'PENDING',
      },
    });

    // 8. Create Supplier Ledger Debit Entry
    await ledgerService.recordEntry(
      tenantId,
      {
        supplierId,
        type: 'PURCHASE',
        debitAmount: totalAmount,
        referenceType: 'PURCHASE_INVOICE',
        referenceId: invoice.id,
      },
      prisma,
    );

    // 9. Update PO status
    const allFullyReceived = po.items.every((item) => {
      const receivedItem = itemsToProcess.find((r) => r.purchaseOrderItemId === item.id);
      const totalReceived = item.receivedQuantity + (receivedItem?.receivedQuantity || 0);
      return totalReceived >= item.quantity;
    });

    const newStatus = allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: newStatus,
        receivedAt: allFullyReceived ? new Date() : undefined,
      },
    });

    // 10. Audit Log
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'GRN_CREATED',
        target: `PO:${purchaseOrderId},GRN:${grnNumber}`,
        type: 'FINANCIAL',
      },
    });

    logger.info(`[GRN] Created ${grnNumber} for PO ${po.orderNumber}, invoice ${invoiceNumber}`);
    return { grn, invoice, totalAmount };
  }
}

export default new StockInService();
