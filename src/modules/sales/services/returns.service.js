import prisma from "../../../config/prisma.js";
import salesReturnRepository from '../repositories/sales_return.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';

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
        },
      });

      if (!saleItem || saleItem.sale.tenantId !== tenantId) {
        throw new Error('Sale item not found');
      }

      // Check return quantity
      const alreadyReturned = saleItem.returns.reduce((sum, r) => sum + r.quantity, 0);
      if (alreadyReturned + quantity > saleItem.quantity) {
        throw new Error(`Cannot return more than sold. Sold: ${saleItem.quantity}, Already Returned: ${alreadyReturned}`);
      }

      // 2. Calculate Refund (Proportional)
      const refundAmount = (saleItem.totalAmount / saleItem.quantity) * quantity;

      // 3. Create Return Record
      const ret = await salesReturnRepository.createReturn({
        tenantId,
        saleId: saleItem.saleId,
        saleItemId: saleItem.id,
        batchId: saleItem.batchId,
        quantity,
        reason,
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        status: 'COMPLETED',
        createdBy: userId
      }, tx);

      if (condition === 'sealed') {
        await tx.inventoryBatch.update({
          where: { id: saleItem.batchId },
          data: {
            quantity: { increment: quantity },
            availableQuantity: { increment: quantity }
          }
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
            notes: `Restock from sales return: ${ret.id}`
          }
        });
      }

      // 5. Update Sale Status
      const newTotalReturned = alreadyReturned + quantity;
      const itemFullyReturned = newTotalReturned >= saleItem.quantity;
      let newSaleStatus = 'COMPLETED';
      if (itemFullyReturned) {
         newSaleStatus = 'REFUNDED';
      }

      await tx.sale.update({
        where: { id: saleItem.saleId },
        data: { status: newSaleStatus }
      });

      return { ret, medicineName: saleItem.medicine.name };
    });

    // 6. Audit Log (outside transaction — queue-based, cannot roll back)
    await auditService.log({
      tenantId,
      userId,
      action: 'SALES_RETURN',
      target: `Return for ${salesReturn.medicineName}`,
      type: 'FINANCIAL'
    });

    return salesReturn.ret;
  }

  async getReturns(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return salesReturnRepository.findAll(tenantId, skip, limit);
  }
}

export default new ReturnsService();
