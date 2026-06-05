import prisma from '../../../config/prisma.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';

class RecallService {
  async getRecalls(tenantId) {
    return prisma.batchRecall.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
    });
  }

  async getRecallById(id, tenantId) {
    const recall = await prisma.batchRecall.findFirst({
      where: { id, tenantId },
    });
    if (!recall) throw new Error('Recall not found');
    return recall;
  }

  async createRecall(data, tenantId, userId) {
    const { medicineId, batchId, reason } = data;

    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
    });
    if (!medicine) throw new Error('Medicine not found');

    let batch = null;
    if (batchId) {
      batch = await prisma.inventoryBatch.findFirst({
        where: { id: batchId, medicineId, deletedAt: null },
      });
      if (!batch) throw new Error('Batch not found');
    }

    const recall = await prisma.batchRecall.create({
      data: {
        tenantId,
        batchNumber: batch?.batchNumber || 'ALL',
        medicineName: medicine.name,
        reason: reason || 'Manufacturer recall',
        status: 'pending',
        date: new Date(),
      },
    });

    // Quarantine the specific batch if provided
    if (batch) {
      await prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: { status: 'QUARANTINED' },
      });

      await prisma.quarantinedBatch.create({
        data: {
          batchId: batch.id,
          reason: `recall: ${reason || 'Manufacturer recall'}`,
          quarantinedBy: userId,
        },
      });
    }

    // If no specific batch, quarantine all active batches of this medicine
    if (!batch) {
      const activeBatches = await prisma.inventoryBatch.findMany({
        where: { medicineId, status: 'ACTIVE', deletedAt: null },
      });

      for (const b of activeBatches) {
        await prisma.inventoryBatch.update({
          where: { id: b.id },
          data: { status: 'QUARANTINED' },
        });

        await prisma.quarantinedBatch.create({
          data: {
            batchId: b.id,
            reason: `recall: ${reason || 'Manufacturer recall'}`,
            quarantinedBy: userId,
          },
        });
      }
    }

    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE_RECALL',
      target: `${medicine.name} - ${reason || 'Recall'}`,
      type: 'INVENTORY',
    });

    await eventBus.publish('RECALL_CREATED', {
      recallId: recall.id,
      medicineId,
      batchId,
      reason,
      tenantId,
    });

    return recall;
  }

  async resolveRecall(id, tenantId, userId) {
    const recall = await this.getRecallById(id, tenantId);

    const updated = await prisma.batchRecall.update({
      where: { id },
      data: { status: 'resolved' },
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'RESOLVE_RECALL',
      target: recall.medicineName,
      type: 'INVENTORY',
    });

    return updated;
  }

  async cancelRecall(id, tenantId, userId) {
    const recall = await this.getRecallById(id, tenantId);

    const updated = await prisma.batchRecall.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    const batches = await prisma.inventoryBatch.findMany({
      where: {
        batchNumber: recall.batchNumber === 'ALL' ? undefined : recall.batchNumber,
        status: 'QUARANTINED',
        deletedAt: null,
      },
    });

    for (const batch of batches) {
      await prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: { status: 'ACTIVE' },
      });
    }

    await auditService.log({
      tenantId,
      userId,
      action: 'CANCEL_RECALL',
      target: recall.medicineName,
      type: 'INVENTORY',
    });

    return updated;
  }
}

export default new RecallService();
