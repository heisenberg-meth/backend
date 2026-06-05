import movementService from '../../stock/service/movement.service.js';
import ledgerService from '../../vendors/services/ledger.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnService {
  async processReturn(tenantId, data, userId) {
    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: data.batchId },
      include: { medicine: true },
    });

    if (!batch) throw new Error(`Batch ${data.batchId} not found`);

    await movementService.stockOut(tenantId, {
      medicineId: batch.medicineId,
      batchId: data.batchId,
      quantity: data.quantity,
      branchId: batch.branchId,
      referenceType: 'SUPPLIER_RETURN',
      reason: data.reason,
    });

    const returnAmount = data.quantity * (batch.purchasePrice || 0);

    await ledgerService.recordEntry(
      tenantId,
      {
        supplierId: data.supplierId,
        type: 'RETURN',
        creditAmount: returnAmount,
        referenceType: 'SUPPLIER_RETURN',
        referenceId: data.batchId,
      },
      prisma,
    );

    const returnRecord = await prisma.supplierReturn.create({
      data: {
        tenantId,
        supplierId: data.supplierId,
        batchId: data.batchId,
        medicineId: batch.medicineId,
        quantity: data.quantity,
        reason: data.reason,
        returnAmount,
        status: 'COMPLETED',
        createdBy: userId,
      },
    });

    logger.info(`[SupplierReturn] Processed return for batch ${data.batchId} (${data.quantity})`);
    return returnRecord;
  }
}

export default new SupplierReturnService();
