import batchRepository from '../repositories/batch.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import inventoryService from '../../realtime-inventory/services/inventory.service.js';
import prisma from '../../../config/prisma.js';

class QuarantineService {
  async quarantine(tenantId, batchId, reason, userId) {
    const batch = await batchRepository.findById(batchId, tenantId);
    if (!batch) throw new Error('Batch not found');

    const result = await batchRepository.quarantineBatch(batchId, reason, userId);

    await inventoryService.recordTransaction(
      prisma,
      tenantId,
      {
        medicineId: batch.medicineId,
        batchId: batch.id,
        branchId: batch.branchId,
        transactionType: 'QUARANTINE',
        quantityChange: -batch.quantity,
        quantityAfter: 0,
        referenceType: 'QUARANTINE_RECORD',
        notes: reason,
      },
      userId,
    );

    await auditService.log({
      tenantId,
      userId,
      action: 'QUARANTINE_BATCH',
      target: `${batch.medicine.name} (Batch: ${batch.batchNumber})`,
      type: 'INVENTORY',
    });

    return result;
  }
}

export default new QuarantineService();
