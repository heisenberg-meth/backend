import prisma from "../../../config/prisma.js";
import movementService from '../../stock/service/movement.service.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import ledgerService from '../../suppliers/financials/ledger/ledger.service.js';

class SupplierReturnService {
  /**
   * Return goods to supplier
   */
  async processReturn(tenantId, data, userId) {
    const { batchId, quantity, supplierId, reason } = data;

    return prisma.$transaction(async (tx) => {
      // 1. Reduce inventory
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        include: { medicine: true },
      });

      if (!batch || batch.medicine.tenantId !== tenantId) {
        throw new Error('Batch not found');
      }

      if (batch.quantity < quantity) {
        throw new Error(`Insufficient batch stock. Available: ${batch.quantity}`);
      }

      await movementService.stockOut(tenantId, {
        medicineId: batch.medicineId,
        quantity,
        type: 'RETURN',
        referenceType: 'SUPPLIER_RETURN',
        notes: reason
      }, userId, tx);

      // 2. Create Supplier Return record
      const supplierReturn = await tx.supplierReturn.create({
        data: {
          tenantId,
          supplierId,
          batchId,
          quantity,
          reason,
          status: 'COMPLETED'
        }
      });

      // 3. Update Supplier Ledger (Credit the payable/liability)
      const refundValue = quantity * batch.purchasePrice;
      await ledgerService.createEntry(tx, {
        tenantId,
        supplierId,
        type: 'RETURN',
        referenceType: 'RETURN_RECORD',
        referenceId: supplierReturn.id,
        creditAmount: refundValue,
        notes: `Return: ${batch.medicine.name} (Batch: ${batch.batchNumber})`
      });

      // 4. Audit Log
      await auditService.log({
        tenantId,
        userId,
        action: 'SUPPLIER_RETURN',
        target: `${batch.medicine.name} (Batch: ${batch.batchNumber})`,
        type: 'INVENTORY'
      });

      return supplierReturn;
    });
  }

  async getReturns(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return prisma.supplierReturn.findMany({
      where: { tenantId },
      include: {
        supplier: true,
        batch: {
          include: { medicine: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
  }
}

export default new SupplierReturnService();
