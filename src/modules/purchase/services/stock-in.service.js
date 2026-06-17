import purchaseOrderRepository from '../repositories/purchase_order.repository.js';
import movementService from '../../stock/service/movement.service.js';
import ledgerService from '../../vendors/services/ledger.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class StockInService {
  async receiveGoods(tenantId, data, userId) {
    await prisma.supplier.findFirst({ where: { id: data.supplierId } });

    const invoice = await prisma.purchaseInvoice.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        purchaseOrderId: data.purchaseOrderId,
        supplierInvoiceNumber: data.supplierInvoiceNumber,
        invoiceDate: data.invoiceDate || new Date(),
        subtotal: data.subtotal,
        gstAmount: data.gstAmount,
        totalAmount: data.totalAmount,
        balanceAmount: data.totalAmount,
        status: 'RECEIVED',
        createdBy: userId,
      },
    });

    if (data.items) {
      for (const item of data.items) {
        await movementService.stockIn(
          tenantId,
          {
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            expiryDate: item.expiryDate,
            purchasePrice: item.purchasePrice,
            sellingPrice: item.sellingPrice,
            branchId: data.branchId,
            referenceType: 'PURCHASE',
            referenceId: invoice.id,
          },
          userId,
        );
      }
    }

    await ledgerService.recordEntry(
      tenantId,
      {
        supplierId: data.supplierId,
        type: 'PURCHASE',
        debitAmount: data.totalAmount,
        referenceType: 'PURCHASE_INVOICE',
        referenceId: invoice.id,
      },
      prisma,
    );

    if (data.purchaseOrderId) {
      await purchaseOrderRepository.updateStatus(
        data.purchaseOrderId,
        tenantId,
        'RECEIVED',
        prisma,
      );
    }

    logger.info(`[StockIn] Received goods for ${data.supplierId}, invoice ${invoice.id}`);
    return invoice;
  }
}

export default new StockInService();
