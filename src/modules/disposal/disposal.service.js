import prisma from '../../config/prisma.js';
import logger from '../../shared/utils/logger.js';
import auditService from '../audit/service/audit.prisma.service.js';
import { mainQueue } from '../../queue/index.js';
import unifiedInventorySummaryService from '../inventory/service/unified-inventory-summary.service.js';

class DisposalService {
  async getExpiredBatches(tenantId, branchId = null) {
    // Use startOfDay to ensure date-only comparison, avoiding UTC/IST timezone bugs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetBranchId =
      branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;
    const where = {
      tenantId,
      OR: [{ expiryDate: { lt: today } }, { status: 'EXPIRED' }],
      status: { not: 'ARCHIVED' },
      isArchived: false, // exclude cleared batches
      availableQuantity: { gt: 0 },
      deletedAt: null,
      medicine: { deletedAt: null },
    };
    if (targetBranchId) where.branchId = targetBranchId;

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
      quantity: b.availableQuantity,
      purchasePrice: Number(b.purchasePrice),
      sellingPrice: Number(b.sellingPrice),
      mrp: Number(b.mrp),
      totalValue: Number(b.availableQuantity) * Number(b.purchasePrice),
      rackLocation: b.rackLocation,
      supplierId: b.supplierId,
      supplierName: b.supplier?.name,
    }));
  }

  async getExpiredOverview(tenantId, branchId = null) {
    // Use startOfDay to ensure date-only comparison, avoiding UTC/IST timezone bugs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetBranchId =
      branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;
    const where = {
      tenantId,
      OR: [{ expiryDate: { lt: today } }, { status: 'EXPIRED' }],
      status: { not: 'ARCHIVED' },
      isArchived: false, // exclude cleared batches
      availableQuantity: { gt: 0 },
      deletedAt: null,
      medicine: { deletedAt: null },
    };
    if (targetBranchId) where.branchId = targetBranchId;

    const batches = await prisma.inventoryBatch.findMany({
      where,
      select: {
        id: true,
        medicineId: true,
        availableQuantity: true,
        purchasePrice: true,
        mrp: true,
      },
    });

    const totalItems = batches.length;
    const totalProducts = new Set(batches.map((b) => b.medicineId)).size;
    const totalUnits = batches.reduce((s, b) => s + b.availableQuantity, 0);
    const totalValue = batches.reduce(
      (s, b) => s + Number(b.availableQuantity) * Number(b.purchasePrice),
      0,
    );
    const totalMrpLoss = batches.reduce(
      (s, b) => s + Number(b.availableQuantity) * Number(b.mrp),
      0,
    );

    return {
      totalExpiredProducts: totalProducts,
      totalExpiredBatches: totalItems,
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

      const isExpired = batch.status === 'EXPIRED' || new Date(batch.expiryDate) < new Date();
      if (!isExpired) {
        results.push({
          medicineId,
          batchId,
          status: 'SKIPPED',
          reason: `Only expired batches can be disposed. Current status: ${batch.status}`,
        });
        continue;
      }

      if (batch.availableQuantity < quantity) {
        results.push({
          medicineId,
          batchId,
          status: 'SKIPPED',
          reason: `Insufficient quantity. Available: ${batch.availableQuantity}, Requested: ${quantity}`,
        });
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const batchBranchId = batch.branchId;
        const remainingQuantity = Number(batch.availableQuantity) - Number(quantity);
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
            batchNumber: batch.batchNumber,
            disposedQuantity: quantity,
            purchasePrice: parseFloat(batch.purchasePrice || 0),
            mrp: parseFloat(batch.mrp || 0),
            reason: finalReason,
            disposedBy: userId,
          },
        });

        if (newStatus === 'ARCHIVED') {
          const updatedBatch = await tx.inventoryBatch.findUnique({
            where: { id: batchId },
            select: { status: true },
          });
          if (updatedBatch.status !== 'ARCHIVED') {
            throw new Error(`Disposal verification failed for batch ${batchId}`);
          }
        }
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
        await unifiedInventorySummaryService.invalidateCache(tenantId);
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

    const targetBranchId =
      branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;
    const where = { tenantId };
    if (targetBranchId) where.branchId = targetBranchId;

    const [disposals, total] = await Promise.all([
      prisma.inventoryDisposal.findMany({
        where,
        orderBy: { disposedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryDisposal.count({ where }),
    ]);

    // Gather unique medicineIds and disposedBy userIds for batch lookup
    const medicineIds = [...new Set(disposals.map((d) => d.medicineId).filter(Boolean))];
    const userIds = [...new Set(disposals.map((d) => d.disposedBy).filter(Boolean))];

    const [medicines, users] = await Promise.all([
      medicineIds.length > 0
        ? prisma.medicine.findMany({
            where: { id: { in: medicineIds } },
            select: { id: true, name: true },
          })
        : [],
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })
        : [],
    ]);

    const medicineMap = new Map(medicines.map((m) => [m.id, m]));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const items = disposals.map((d) => ({
      id: d.id,
      tenantId: d.tenantId,
      branchId: d.branchId,
      medicineId: d.medicineId,
      medicineName: medicineMap.get(d.medicineId)?.name ?? null,
      batchId: d.batchId,
      quantity: d.quantity,
      reason: d.reason,
      disposedBy: d.disposedBy,
      disposedByName: userMap.get(d.disposedBy)?.fullName ?? null,
      disposedAt: d.disposedAt,
    }));

    return { items, total, page, limit };
  }

  /**
   * Returns the count of batches that are eligible for inventory cleanup.
   * Eligible = status ARCHIVED  OR  (availableQuantity=0 AND a disposal record exists).
   * These are already-disposed batches that still appear in stock views.
   */
  async clearableCount(tenantId, branchId = null) {
    const targetBranchId =
      branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    const where = {
      tenantId,
      deletedAt: null,
      isArchived: false, // not yet cleaned up
      OR: [
        { status: 'ARCHIVED' },
        {
          availableQuantity: { lte: 0 },
          disposals: { some: {} }, // at least one disposal record exists
        },
      ],
      // Never clear active/low-stock/expiring-only batches
      NOT: {
        status: { in: ['ACTIVE', 'LOW_STOCK', 'EXPIRING', 'DAMAGED', 'RECALLED', 'QUARANTINED'] },
        availableQuantity: { gt: 0 },
      },
    };

    if (targetBranchId) where.branchId = targetBranchId;

    const count = await prisma.inventoryBatch.count({ where });
    return { count };
  }

  /**
   * Archives all eligible disposed/expired batches in bulk so they no longer
   * appear in active inventory views.
   *
   * Business rules enforced:
   *  - Only ARCHIVED status batches OR zero-qty batches with a disposal record are cleared.
   *  - Active, low-stock, expiring, or merely-expired (not disposed) batches are skipped.
   *  - Tenant isolation is mandatory.
   *  - Idempotent: re-running after a successful clear returns 0 remaining.
   *  - Chunked in groups of 500 to handle large datasets gracefully.
   */
  async clearExpired(tenantId, userId, branchId = null) {
    const targetBranchId =
      branchId === 'null' || branchId === 'undefined' || !branchId ? null : branchId;

    // --- Step 1: Fetch all clearable batch IDs ---
    const baseWhere = {
      tenantId,
      deletedAt: null,
      isArchived: false,
      OR: [
        { status: 'ARCHIVED' },
        {
          availableQuantity: { lte: 0 },
          disposals: { some: {} },
        },
      ],
      NOT: {
        status: { in: ['ACTIVE', 'LOW_STOCK', 'EXPIRING', 'DAMAGED', 'RECALLED', 'QUARANTINED'] },
        availableQuantity: { gt: 0 },
      },
    };

    if (targetBranchId) baseWhere.branchId = targetBranchId;

    const eligibleBatches = await prisma.inventoryBatch.findMany({
      where: baseWhere,
      select: {
        id: true,
        availableQuantity: true,
        status: true,
        disposals: { select: { id: true }, take: 1 },
      },
    });

    if (eligibleBatches.length === 0) {
      return { success: true, cleared: 0, remaining: 0 };
    }

    // --- Step 2: Secondary validation – skip anything that doesn't truly qualify ---
    const validated = [];
    const skipped = [];
    const failed = [];

    for (const b of eligibleBatches) {
      const isArchived = b.status === 'ARCHIVED';
      const isDisposedAndEmpty = b.availableQuantity <= 0 && b.disposals.length > 0;

      if (!isArchived && !isDisposedAndEmpty) {
        skipped.push(b.id);
        continue;
      }
      validated.push(b.id);
    }

    // --- Step 3: Chunk the update into batches of 500 ---
    const CHUNK_SIZE = 500;
    let totalCleared = 0;

    for (let i = 0; i < validated.length; i += CHUNK_SIZE) {
      const chunk = validated.slice(i, i + CHUNK_SIZE);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.inventoryBatch.updateMany({
            where: {
              id: { in: chunk },
              tenantId, // extra safety: tenant isolation inside transaction
              isArchived: false, // idempotency guard
            },
            data: {
              isArchived: true,
              archivedAt: new Date(),
              archivedBy: userId,
              archiveReason: 'Expired Cleanup',
            },
          });
        });
        totalCleared += chunk.length;
      } catch (err) {
        logger.error({ err, chunk: chunk.length }, 'Clear expired chunk failed');
        failed.push(...chunk);
      }
    }

    // --- Step 4: Audit log ---
    if (totalCleared > 0) {
      await auditService.log({
        tenantId,
        userId,
        action: 'EXPIRED_BATCH_CLEANUP',
        target: `${totalCleared} expired batches archived from active inventory`,
        type: 'INVENTORY',
      });

      // Queue analytics refresh
      try {
        await unifiedInventorySummaryService.invalidateCache(tenantId);
        await mainQueue.add('update-analytics', { tenantId });
      } catch (e) {
        logger.error({ err: e }, 'Failed to queue analytics update after clearExpired');
      }
    }

    // --- Step 5: Count remaining clearable batches ---
    const remaining = await prisma.inventoryBatch.count({ where: baseWhere });

    return {
      success: true,
      cleared: totalCleared,
      skipped: skipped.length,
      failed: failed.length,
      remaining,
    };
  }
}

export default new DisposalService();
