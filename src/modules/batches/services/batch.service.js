import batchRepository from '../repositories/batch.repository.js';
import batchAuditRepository from '../repositories/batch-audit.repository.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { mainQueue } from '../../../queue/index.js';
import prisma from '../../../config/prisma.js';
import movementService from '../../stock/service/movement.service.js';
import redisClient from '../../../config/redis.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import logger from '../../../shared/utils/logger.js';

class BatchService {
  async getBatches(params) {
    return batchRepository.findAll(params);
  }

  async getBatch(id) {
    const batch = await batchRepository.findById(id);
    if (!batch) throw new Error('Batch not found');

    const auditLogs = await batchAuditRepository.findByBatchId(id);
    const traceability = await batchRepository.getTraceability(id);

    return {
      ...batch,
      auditLogs,
      traceability,
    };
  }

  async createBatch(data, tenantId, userId) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: data.medicineId, tenantId, deletedAt: null },
    });
    if (!medicine) throw new Error('Medicine not found');

    const existingBatch = await batchRepository.findByBatchNumber(data.batchNumber, tenantId);
    if (existingBatch) {
      throw new Error(`Batch number '${data.batchNumber}' already exists for this medicine`);
    }

    const batch = await movementService.stockIn(
      tenantId,
      {
        ...data,
        referenceType: 'MANUAL_ENTRY',
        notes: data.notes || `Manual batch creation for ${medicine.name}`,
      },
      userId,
    );

    await batchAuditRepository.log({
      tenantId,
      batchId: batch.id,
      actionType: 'BATCH_CREATED',
      afterState: batch,
      performedBy: userId,
      notes: data.notes,
    });

    await mainQueue.add('update-analytics', { tenantId });
    await eventBus.publish('BATCH_CREATED', {
      batchId: batch.id,
      medicineId: data.medicineId,
      tenantId,
    });

    return batch;
  }

  async updateBatch(id, data, userId, reqInfo = {}) {
    const batch = await batchRepository.findById(id);
    if (!batch) throw new Error('Batch not found');

    const updateData = { ...data };
    delete updateData.reason;

    if (data.quantity !== undefined) {
      updateData.availableQuantity = data.quantity - (batch.reservedQuantity || 0);
    }

    if (data.mrp !== undefined) {
      updateData.sellingPrice = data.mrp;
    }

    const updated = await batchRepository.update(id, updateData);

    const totalQty = await prisma.inventoryBatch.aggregate({
      where: {
        medicineId: batch.medicineId,
        tenantId: batch.tenantId,
        branchId: batch.branchId,
        deletedAt: null,
      },
      _sum: {
        quantity: true,
      },
    });

    const newStock = totalQty._sum.quantity || 0;

    const inventory = await prisma.inventory.findFirst({
      where: {
        medicineId: batch.medicineId,
        tenantId: batch.tenantId,
        branchId: batch.branchId,
      },
    });

    if (inventory) {
      let status = 'HEALTHY';
      if (newStock <= 0) {
        status = 'OUT_OF_STOCK';
      } else if (newStock <= (inventory.reorderPoint || 10)) {
        status = 'LOW_STOCK';
      }

      await prisma.inventory.update({
        where: { id: inventory.id },
        data: {
          currentStock: newStock,
          status,
        },
      });
    }

    await batchAuditRepository.log({
      tenantId: batch.tenantId,
      batchId: id,
      actionType: 'METADATA_UPDATE',
      beforeState: batch,
      afterState: updated,
      performedBy: userId,
      reason: data.reason || 'Manual stock/batch update',
      ipAddress: reqInfo.ip,
      userAgent: reqInfo.userAgent,
    });

    await mainQueue.add('update-analytics', { tenantId: batch.tenantId });
    await eventBus.publish('BATCH_UPDATED', {
      batchId: id,
      medicineId: batch.medicineId,
      tenantId: batch.tenantId,
    });

    try {
      const keys = await scanKeys(`inventory:${batch.tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn('[REDIS CACHE ERROR]', err);
    }

    return updated;
  }

  async deleteBatch(id, tenantId, userId) {
    const batch = await batchRepository.findById(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new Error('Batch not found');
    }

    if (batch.quantity > 0) {
      throw new Error(
        'Cannot delete batch with active stock. Quarantine or adjust stock to zero first.',
      );
    }

    await batchRepository.softDelete(id);

    await batchAuditRepository.log({
      tenantId,
      batchId: id,
      actionType: 'ARCHIVED',
      beforeState: batch,
      performedBy: userId,
      notes: 'Batch soft deleted/archived',
    });
  }

  async quarantineBatch(id, reason, tenantId, userId, reqInfo = {}) {
    const batch = await batchRepository.findById(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new Error('Batch not found');
    }

    if (batch.status === 'QUARANTINED') {
      throw new Error('Batch is already quarantined');
    }

    const quarantined = await batchRepository.quarantine(id, reason, userId);

    await batchAuditRepository.log({
      tenantId,
      batchId: id,
      actionType: 'QUARANTINE',
      beforeState: batch,
      afterState: quarantined,
      performedBy: userId,
      reason,
      ipAddress: reqInfo.ip,
      userAgent: reqInfo.userAgent,
    });

    await eventBus.publish('BATCH_QUARANTINED', { batchId: id, reason, tenantId });

    return quarantined;
  }

  async recallBatch(id, reason, tenantId, userId, reqInfo = {}) {
    const batch = await batchRepository.findById(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new Error('Batch not found');
    }

    const recalled = await batchRepository.recall(id, reason, userId);

    await batchAuditRepository.log({
      tenantId,
      batchId: id,
      actionType: 'RECALL',
      beforeState: batch,
      afterState: recalled,
      performedBy: userId,
      reason,
      ipAddress: reqInfo.ip,
      userAgent: reqInfo.userAgent,
    });

    await eventBus.publish('BATCH_RECALLED', {
      batchId: id,
      medicineName: batch.medicine.name,
      batchNumber: batch.batchNumber,
      reason,
      tenantId,
    });

    return recalled;
  }

  async releaseQuarantine(id, tenantId, userId, reqInfo = {}) {
    const batch = await batchRepository.findById(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'QUARANTINED') {
      throw new Error('Batch is not quarantined');
    }

    const released = await batchRepository.releaseQuarantine(id);

    await batchAuditRepository.log({
      tenantId,
      batchId: id,
      actionType: 'RELEASE_QUARANTINE',
      beforeState: batch,
      afterState: released,
      performedBy: userId,
      ipAddress: reqInfo.ip,
      userAgent: reqInfo.userAgent,
    });

    return released;
  }

  async getTraceability(id, tenantId) {
    const batch = await batchRepository.findById(id);
    if (!batch || batch.tenantId !== tenantId) {
      throw new Error('Batch not found');
    }

    const usage = await batchRepository.getTraceability(id);

    return {
      batchInfo: {
        batchNumber: batch.batchNumber,
        medicineName: batch.medicine.name,
        expiryDate: batch.expiryDate,
      },
      affectedInvoices: usage.map((item) => ({
        invoiceNumber: item.invoice.invoiceNumber,
        date: item.invoice.createdAt,
        quantitySold: item.quantity,
        patient: item.invoice.patient,
      })),
      totalPatientsAffected: new Set(
        usage.filter((i) => i.invoice.patientId).map((i) => i.invoice.patientId),
      ).size,
    };
  }

  async getFefoBatches(medicineId, tenantId, quantity) {
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
    });
    if (!medicine) throw new Error('Medicine not found');

    return batchRepository.getFefoBatches(medicineId, quantity ? parseInt(quantity) : undefined);
  }

  async getQuarantined(tenantId) {
    return batchRepository.findQuarantined(tenantId);
  }

  async getRecallReport(tenantId) {
    const recalledBatches = await prisma.inventoryBatch.findMany({
      where: { tenantId, status: 'RECALLED', deletedAt: null },
      include: { medicine: { select: { name: true } } },
    });

    const report = [];
    for (const batch of recalledBatches) {
      const traceability = await this.getTraceability(batch.id, tenantId);
      report.push({
        ...batch,
        ...traceability,
      });
    }

    return report;
  }
}

export default new BatchService();
