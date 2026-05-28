import prisma from "../../../config/prisma.js";
import movementService from '../../stock/service/movement.service.js';
import salesReturnRepository from '../repositories/sales_return.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';

class ReturnsService {
  /**
   * Process a sales return
   */
  async processReturn(tenantId, data, userId) {
    const { saleItemId, quantity, reason, condition = 'sealed' } = data;

    return prisma.$transaction(async (tx) => {
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
      const salesReturn = await salesReturnRepository.createReturn({
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

      // 4. Inventory Restock (only if condition is sealed)
      if (condition === 'sealed') {
        await movementService.stockIn(tenantId, {
          medicineId: saleItem.medicineId,
          batchId: saleItem.batchId,
          quantity,
          expiryDate: new Date(),
          purchasePrice: 0,
          sellingPrice: saleItem.unitPrice,
          notes: `Restock from return: ${salesReturn.id}`
        }, userId, tx);
        
        // Manual override for stockIn to use existing batch
        await tx.inventoryBatch.update({
          where: { id: saleItem.batchId },
          data: { quantity: { increment: quantity } }
        });
      }

      // 5. Update Sale Status
      const newTotalReturned = alreadyReturned + quantity;
      const totalSold = saleItem.sale.totalItems;
      let newSaleStatus = 'PARTIALLY_RETURNED';
      if (newTotalReturned === totalSold) {
         newSaleStatus = 'RETURNED';
      }

      await tx.sale.update({
        where: { id: saleItem.saleId },
        data: { status: newSaleStatus }
      });

      // 6. Audit Log
      await auditService.log({
        tenantId,
        userId,
        action: 'SALES_RETURN',
        target: `Return for ${saleItem.medicine.name}`,
        type: 'FINANCIAL'
      });

      return salesReturn;
    });
  }

  async getReturns(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return salesReturnRepository.findAll(tenantId, skip, limit);
  }
}

export default new ReturnsService();
