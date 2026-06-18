import prisma from '../../../config/prisma.js';
import salesReturnRepository from '../repositories/sales_return.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import cacheInvalidator from '../../inventory/service/cache-invalidator.service.js';

class ReturnsService {
  /**
   * Process a sales return
   */
  async processReturn(tenantId, data, userId) {
    const { saleItemId, quantity, reason, condition = 'sealed' } = data;

    const salesReturn = await prisma.$transaction(async (tx) => {
      // 1. Validate Sale Item
      const saleItem = await tx.saleItem.findUnique({
        where: { id: saleItemId },
        include: {
          sale: true,
          returns: true,
          medicine: true,
          batch: true,
        },
      });

      if (!saleItem || saleItem.sale.tenantId !== tenantId) {
        throw new Error('Sale item not found');
      }

      // Check return quantity
      const alreadyReturned = saleItem.returns.reduce((sum, r) => sum + r.quantity, 0);
      if (alreadyReturned + quantity > saleItem.quantity) {
        throw new Error(
          `Cannot return more than sold. Sold: ${saleItem.quantity}, Already Returned: ${alreadyReturned}`,
        );
      }

      // 2. Calculate Refund (Proportional)
      const unitPrice = Number(saleItem.totalAmount) / saleItem.quantity;
      const refundAmount = parseFloat((unitPrice * quantity).toFixed(2));

      // 3. Create Return Record
      const ret = await salesReturnRepository.createReturn(
        {
          tenantId,
          saleId: saleItem.saleId,
          saleItemId: saleItem.id,
          batchId: saleItem.batchId,
          quantity,
          reason,
          refundAmount,
          status: 'REFUNDED',
          createdBy: userId,
        },
        tx,
      );

      // 4. Restore inventory if sealed
      if (condition === 'sealed' && saleItem.batchId) {
        await tx.inventoryBatch.update({
          where: { id: saleItem.batchId },
          data: {
            quantity: { increment: quantity },
            availableQuantity: { increment: quantity },
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId,
            medicineId: saleItem.medicineId,
            batchId: saleItem.batchId,
            movementType: 'RETURN',
            quantity: quantity,
            referenceType: 'SALES_RETURN',
            referenceId: ret.id,
            performedBy: userId,
            notes: `Restock from sales return: ${ret.id}`,
          },
        });

        // Update Inventory table currentStock
        const inventory = await tx.inventory.findFirst({
          where: {
            tenantId,
            medicineId: saleItem.medicineId,
            branchId: saleItem.sale.branchId,
          },
        });
        if (inventory) {
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { currentStock: { increment: quantity } },
          });
        }
      }

      // 5. Calculate total returned for this sale item
      const totalReturned = alreadyReturned + quantity;
      const totalSold = saleItem.quantity;

      // 6. Update invoice status based on return
      const invoice = await tx.invoice.findUnique({
        where: { id: saleItem.sale.invoiceId },
        include: { items: true },
      });

      if (invoice) {
        // Check if all items in invoice have been fully returned
        let totalInvoiceQty = 0;
        let totalInvoiceReturned = 0;

        for (const item of invoice.items) {
          totalInvoiceQty += item.quantity;
          const itemReturns = await tx.salesReturn.aggregate({
            where: {
              saleItemId: item.id,
              status: 'REFUNDED',
            },
            _sum: { quantity: true },
          });
          totalInvoiceReturned += itemReturns._sum.quantity || 0;
        }

        let newInvoiceStatus = 'COMPLETED';
        if (totalInvoiceReturned >= totalInvoiceQty) {
          newInvoiceStatus = 'REFUNDED';
        } else if (totalInvoiceReturned > 0) {
          newInvoiceStatus = 'PARTIALLY_REFUNDED';
        }

        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: newInvoiceStatus },
        });
      }

      // 7. Update sale status
      await tx.sale.update({
        where: { id: saleItem.saleId },
        data: { status: totalReturned >= totalSold ? 'REFUNDED' : 'COMPLETED' },
      });

      return { ret, medicineName: saleItem.medicine.name, medicineId: saleItem.medicineId };
    });

    // 8. Invalidate caches after transaction commits
    try {
      await cacheInvalidator.invalidateInventoryCaches(tenantId, salesReturn.medicineId);
    } catch (err) {
      // Non-critical, log but don't fail
      console.error('[RETURN] Cache invalidation failed:', err.message);
    }

    // 9. Audit Log (outside transaction)
    await auditService.log({
      tenantId,
      userId,
      action: 'SALES_RETURN',
      target: `Return for ${salesReturn.medicineName}`,
      type: 'FINANCIAL',
    });

    return salesReturn.ret;
  }

  async getReturns(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return salesReturnRepository.findAll(tenantId, skip, limit);
  }
}

export default new ReturnsService();
