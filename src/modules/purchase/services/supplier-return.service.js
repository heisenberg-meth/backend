import movementService from '../../stock/service/movement.service.js';
import ledgerService from '../../vendors/services/ledger.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierReturnService {
  async processReturn(tenantId, data, userId) {
    if (!data.batchId) {
      throw new Error('Batch ID is required');
    }

    const batch = await prisma.inventoryBatch.findUnique({
      where: { id: data.batchId },
      include: { medicine: true },
    });

    if (!batch) throw new Error(`Batch ${data.batchId} not found`);

    if (data.quantity > batch.quantity) {
      throw new Error(`Return quantity (${data.quantity}) exceeds available stock (${batch.quantity})`);
    }

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
