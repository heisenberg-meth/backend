import prisma from "../../../config/prisma.js";
import movementService from '../../stock/service/movement.service.js';
import purchaseOrderRepository from '../repositories/purchase_order.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import ledgerService from '../../suppliers/financials/ledger/ledger.service.js';
import supplierRepository from '../repositories/supplier.repository.js';

class StockInService {
  /**
   * Receive goods and update inventory
   */
  async receiveGoods(tenantId, data, userId) {
    const { purchaseOrderId, supplierInvoiceNumber, invoiceDate, items, supplierId } = data;

    return prisma.$transaction(async (tx) => {
      // 0. Fetch Supplier to get payment terms
      const supplier = await supplierRepository.findById(supplierId, tenantId);
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + (supplier?.paymentTermsDays || 30));

      // 1. Create Purchase Invoice record
      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          supplierId,
          purchaseOrderId,
          invoiceNumber: supplierInvoiceNumber,
          invoiceDate: new Date(invoiceDate),
          dueDate,
          paymentStatus: 'PENDING',
          subtotal: data.subtotal,
          gstAmount: data.gstAmount,
          totalAmount: data.totalAmount,
          invoicePdfUrl: data.invoicePdfUrl,
        },
      });

      // 2. Update Supplier Ledger (Debit the payable)
      await ledgerService.createEntry(tx, {
        tenantId,
        supplierId,
        type: 'PURCHASE',
        referenceType: 'PURCHASE_INVOICE',
        referenceId: purchaseInvoice.id,
        debitAmount: data.totalAmount,
        notes: `Invoice: ${supplierInvoiceNumber}`,
      });

      // 3. Process each item (Create Batch + Stock In)
      for (const item of items) {
        await movementService.stockIn(
          tenantId,
          {
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            expiryDate: item.expiryDate,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice,
            notes: `Goods received against PO: ${purchaseOrderId}`,
          },
          userId,
          tx,
        );
      }

      // 4. Update PO Status
      if (purchaseOrderId) {
        await purchaseOrderRepository.updateStatus(purchaseOrderId, tenantId, 'RECEIVED', tx);
      }

      // 5. Audit Log
      await auditService.log({
        tenantId,
        userId,
        action: 'RECEIVE_GOODS',
        target: supplierInvoiceNumber,
        type: 'INVENTORY',
      });

      return purchaseInvoice;
    });
  }
}

export default new StockInService();
