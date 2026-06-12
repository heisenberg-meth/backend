import prisma from '../../config/prisma.js';
import logger from '../../shared/utils/logger.js';
import auditService from '../audit/service/audit.prisma.service.js';
import { mainQueue } from '../../queue/index.js';

class DisposalService {
  async getExpiredBatches(tenantId, branchId = null) {
    const now = new Date();
    const where = {
      tenantId,
      expiryDate: { lt: now },
      quantity: { gt: 0 },
      deletedAt: null,
      medicine: { deletedAt: null },
    };
    if (branchId) where.branchId = branchId;

    const batches = await prisma.inventoryBatch.findMany({
      where,
      include: {
        medicine: {
          select: { id: true, name: true, genericName: true, strength: true, dosageForm: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    return batches.map((b) => ({
      batchId: b.id,
      medicineId: b.medicineId,
      medicineName: b.medicine.name,
      genericName: b.medicine.genericName,
      strength: b.medicine.strength,
      dosageForm: b.medicine.dosageForm,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      quantity: b.quantity,
      purchasePrice: Number(b.purchasePrice),
      sellingPrice: Number(b.sellingPrice),
      mrp: Number(b.mrp),
      totalValue: Number(b.quantity) * Number(b.purchasePrice),
      rackLocation: b.rackLocation,
      supplierId: b.supplierId,
      supplierName: b.supplier?.name,
    }));
  }

  async getExpiredOverview(tenantId, branchId = null) {
    const where = {
      tenantId,
      expiryDate: { lt: new Date() },
      quantity: { gt: 0 },
      deletedAt: null,
      medicine: { deletedAt: null },
    };
    if (branchId) where.branchId = branchId;

    const batches = await prisma.inventoryBatch.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        purchasePrice: true,
        mrp: true,
      },
    });

    const totalItems = batches.length;
    const totalUnits = batches.reduce((s, b) => s + b.quantity, 0);
    const totalValue = batches.reduce(
      (s, b) => s + Number(b.quantity) * Number(b.purchasePrice),
      0,
    );
    const totalMrpLoss = batches.reduce((s, b) => s + Number(b.quantity) * Number(b.mrp), 0);

    return {
      totalExpiredProducts: totalItems,
      totalUnits,
      totalInventoryValue: totalValue,
      totalMrpLoss,
    };
  }

  async bulkDispose(tenantId, userId, branchId, { items, reason }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('No items provided for disposal');
    }
    const finalReason = reason || 'Expired Stock';

    const results = [];

    for (const item of items) {
      const { medicineId, batchId, quantity } = item;

      const batch = await prisma.inventoryBatch.findFirst({
        where: { id: batchId, tenantId, deletedAt: null },
      });

      if (!batch) {
        results.push({ medicineId, batchId, status: 'SKIPPED', reason: 'Batch not found' });
        continue;
      }

      if (batch.quantity < quantity) {
        results.push({
          medicineId,
          batchId,
          status: 'SKIPPED',
          reason: `Insufficient quantity. Available: ${batch.quantity}, Requested: ${quantity}`,
        });
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const batchBranchId = batch.branchId;
        const remainingQuantity = Number(batch.quantity) - Number(quantity);
        const newStatus = remainingQuantity <= 0 ? 'ARCHIVED' : batch.status;

        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: {
            quantity: { decrement: quantity },
            availableQuantity: { decrement: quantity },
            status: newStatus,
          },
        });

        if (batchBranchId) {
          await tx.inventory.upsert({
            where: {
              tenantId_branchId_medicineId: { tenantId, branchId: batchBranchId, medicineId },
            },
            update: { currentStock: { decrement: quantity } },
            create: {
              tenantId,
              branchId: batchBranchId,
              medicineId,
              currentStock: 0,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: batchBranchId,
            medicineId,
            batchId,
            movementType: 'DISPOSAL',
            quantity,
            quantityBefore: batch.quantity,
            quantityAfter: batch.quantity - quantity,
            referenceType: 'BULK_DISPOSAL',
            performedBy: userId,
            notes: finalReason,
          },
        });

        await tx.inventoryDisposal.create({
          data: {
            tenantId,
            branchId: batchBranchId,
            medicineId,
            batchId,
            quantity,
            reason: finalReason,
            disposedBy: userId,
          },
        });
      });

      results.push({ medicineId, batchId, quantity, status: 'DISPOSED' });
    }

    const disposedCount = results.filter((r) => r.status === 'DISPOSED').length;
    if (disposedCount > 0) {
      await auditService.log({
        tenantId,
        userId,
        action: 'BULK_DISPOSAL',
        target: `${disposedCount} items disposed`,
        type: 'INVENTORY',
      });
      try {
        await mainQueue.add('update-analytics', { tenantId });
      } catch (e) {
        logger.error({ err: e }, 'Failed to queue analytics update after disposal');
      }
    }

    return results;
  }

  async getDisposalHistory(tenantId, branchId = null, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = { tenantId };
    if (branchId) where.branchId = branchId;

    const [disposals, total] = await Promise.all([
      prisma.inventoryDisposal.findMany({
        where,
        include: {
          medicine: { select: { id: true, name: true } },
          disposer: { select: { id: true, fullName: true } },
        },
        orderBy: { disposedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryDisposal.count({ where }),
    ]);

    return { items: disposals, total, page, limit };
  }
}

export default new DisposalService();
