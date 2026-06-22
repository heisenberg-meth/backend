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

  async assignSupplier(batchId, supplierId, tenantId) {
    const batch = await batchRepository.findById(batchId);
    if (!batch) throw new Error('Batch not found');
    if (batch.tenantId !== tenantId) throw new Error('Access denied');

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new Error('Supplier not found');
    }

    return batchRepository.update(batchId, { supplierId: supplierId || null });
  }

  async bulkAssignSupplier(batchIds, supplierId, tenantId) {
    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      throw new Error('At least one batch ID is required');
    }

    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new Error('Supplier not found');
    }

    const result = await prisma.inventoryBatch.updateMany({
      where: {
        id: { in: batchIds },
        tenantId,
        deletedAt: null,
      },
      data: { supplierId: supplierId || null },
    });

    return { updated: result.count };
  }

  async backfillSupplierFromMedicine(tenantId) {
    const medicinesWithBoth = await prisma.$queryRawUnsafe(`
      WITH with_supplier AS (
        SELECT DISTINCT "medicineId" 
        FROM "InventoryBatch" 
        WHERE "supplierId" IS NOT NULL AND "deletedAt" IS NULL AND "tenantId" = $1
      ),
      without_supplier AS (
        SELECT DISTINCT "medicineId" 
        FROM "InventoryBatch" 
        WHERE "supplierId" IS NULL AND "deletedAt" IS NULL AND "tenantId" = $1
      )
      SELECT ws."medicineId"
      FROM with_supplier ws
      INNER JOIN without_supplier wsu ON ws."medicineId" = wsu."medicineId"
    `, tenantId);

    let totalUpdated = 0;
    for (const { medicineId } of medicinesWithBoth) {
      const bestSupplier = await prisma.$queryRawUnsafe(`
        SELECT ib."supplierId", COUNT(*) as cnt
        FROM "InventoryBatch" ib
        WHERE ib."medicineId" = $1
          AND ib."supplierId" IS NOT NULL AND ib."deletedAt" IS NULL
        GROUP BY ib."supplierId"
        ORDER BY cnt DESC
        LIMIT 1
      `, medicineId);

      if (bestSupplier.length === 0) continue;

      const result = await prisma.inventoryBatch.updateMany({
        where: { medicineId, supplierId: null, deletedAt: null, tenantId },
        data: { supplierId: bestSupplier[0].supplierId },
      });

      totalUpdated += result.count;
    }

    return { medicinesProcessed: medicinesWithBoth.length, batchesUpdated: totalUpdated };
  }

  async exportBatchesWithoutSupplier(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: { tenantId, supplierId: null, deletedAt: null },
      include: {
        medicine: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });

    return { batches, suppliers };
  }

  async importSupplierAssignments(tenantId, assignments) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new Error('No assignments provided');
    }

    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const supplierMap = {};
    for (const s of suppliers) {
      supplierMap[s.name.toLowerCase().trim()] = s.id;
    }

    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of assignments) {
      const batchId = row.batchId || row.batch_id;
      const supplierName = row.supplierName || row.supplier_name || row.supplier;

      if (!batchId || !supplierName) {
        skipped++;
        continue;
      }

      const supplierId = supplierMap[supplierName.toLowerCase().trim()];
      if (!supplierId) {
        errors.push({ batchId, reason: `Supplier "${supplierName}" not found` });
        skipped++;
        continue;
      }

      const result = await prisma.inventoryBatch.updateMany({
        where: { id: batchId, tenantId, deletedAt: null },
        data: { supplierId },
      });

      if (result.count > 0) updated++;
      else {
        errors.push({ batchId, reason: 'Batch not found' });
        skipped++;
      }
    }

    return { updated, skipped, errors: errors.slice(0, 50) };
  }
}

export default new BatchService();
