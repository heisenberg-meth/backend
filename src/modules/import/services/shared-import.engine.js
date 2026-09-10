import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import auditService from '../../audit/service/audit.service.js';
import { acquireLock, releaseLock, startLockHeartbeat } from '../../../shared/utils/lock.js';

class SharedImportEngine {
  constructor() {
    this.CHUNK_SIZE = 100;
  }

  /**
   * Commits the given payloads in chunks to avoid Prisma transaction timeouts.
   */
  async commitChunks({
    tenantId,
    branchId,
    userId,
    jobId,
    newMedicines = [],
    newBatches = [],
    newMovements = [],
    inventoryUpdates = [],
    batchQuantityUpdates = [],
    medicineUpdates = [],
    categoriesToCreate = [],
    manufacturersToCreate = [],
    progressTotal = null,
    onProgress = null,
  }) {
    if (!branchId || ['all', 'null', 'undefined'].includes(branchId)) {
      const err = new Error('A valid branch is required for inventory import.');
      err.statusCode = 400;
      err.errorCode = 'BRANCH_REQUIRED';
      throw err;
    }

    const lockResource = `inventory-op:${tenantId}:${branchId}`;
    const locked = await acquireLock(lockResource, 60000);

    if (!locked) {
      const err = new Error('An inventory operation or clear is already in progress. Please wait.');
      err.statusCode = 409;
      err.errorCode = 'OPERATION_IN_PROGRESS';
      throw err;
    }

    const stopHeartbeat =
      typeof startLockHeartbeat === 'function' ? startLockHeartbeat(lockResource, 60000) : () => {};

    try {
      // 1. Create categories and manufacturers (Safe to do outside the main row chunk loop)
      const categoryNameToId = new Map();
      const manufacturerNameToId = new Map();

      if (categoriesToCreate?.length > 0 || manufacturersToCreate?.length > 0) {
        await prisma.$transaction(
          async (tx) => {
            for (const cat of categoriesToCreate || []) {
              const key = cat.name.toLowerCase().trim();
              if (!categoryNameToId.has(key)) {
                const created = await tx.medicineCategory.create({
                  data: { tenantId, name: cat.name },
                });
                categoryNameToId.set(key, created.id);
              }
            }

            for (const mfr of manufacturersToCreate || []) {
              const key = mfr.name.toLowerCase().trim();
              if (!manufacturerNameToId.has(key)) {
                const created = await tx.manufacturer.create({
                  data: { tenantId, name: mfr.name },
                });
                manufacturerNameToId.set(key, created.id);
              }
            }
          },
          { timeout: 30000 },
        );
      }

      // Resolve category and manufacturer IDs for new medicines
      for (const m of newMedicines) {
        if (!m.categoryId && m._categoryName) {
          m.categoryId = categoryNameToId.get(m._categoryName.toLowerCase().trim());
        }
        if (!m.manufacturerId && m._manufacturerName) {
          m.manufacturerId = manufacturerNameToId.get(m._manufacturerName.toLowerCase().trim());
        }
        delete m._categoryName;
        delete m._manufacturerName;
      }

      // Combine all operations into cohesive units per medicine to chunk them
      // For simplicity, we can chunk based on the number of new medicines or new batches.
      // However, since some rows might only be batch updates, we should chunk by a fixed size across all arrays.

      // We will chunk the array of all unique medicine IDs being updated.
      const uniqueMedicineIds = new Set([
        ...(newMedicines || []).map((m) => m.id),
        ...(newBatches || []).map((b) => b.medicineId),
        ...(inventoryUpdates || []).map((i) => i.medicineId),
        ...(newMovements || []).map((m) => m.medicineId),
        ...(batchQuantityUpdates || []).map((u) => u.medicineId),
        ...(medicineUpdates || []).map((u) => u.id),
      ]);

      const allMedicineIds = Array.from(uniqueMedicineIds);
      let totalChunks = Math.ceil(allMedicineIds.length / this.CHUNK_SIZE);

      logger.info(
        { jobId, totalMedicines: allMedicineIds.length, chunks: totalChunks },
        '[SharedImportEngine] Starting chunked commit',
      );

      for (let i = 0; i < allMedicineIds.length; i += this.CHUNK_SIZE) {
        const chunkMedIds = new Set(allMedicineIds.slice(i, i + this.CHUNK_SIZE));

        const chunkMedicines = (newMedicines || []).filter((m) => chunkMedIds.has(m.id));
        const chunkBatches = (newBatches || []).filter((b) => chunkMedIds.has(b.medicineId));
        const chunkMovements = (newMovements || []).filter((m) => chunkMedIds.has(m.medicineId));
        const chunkBatchUpdates = (batchQuantityUpdates || []).filter((u) =>
          chunkMedIds.has(u.medicineId),
        );
        const chunkMedicineUpdates = (medicineUpdates || []).filter((u) => chunkMedIds.has(u.id));

        const chunkInventoryUpdates = new Map();
        for (const inv of inventoryUpdates || []) {
          if (chunkMedIds.has(inv.medicineId)) {
            chunkInventoryUpdates.set(
              inv.medicineId,
              (chunkInventoryUpdates.get(inv.medicineId) || 0) + inv.qty,
            );
          }
        }

        await this._commitChunkWithRetries({
          tenantId,
          branchId,
          chunkMedicines,
          chunkBatches,
          chunkMovements,
          chunkBatchUpdates,
          chunkMedicineUpdates,
          chunkInventoryUpdates,
        });

        if (userId) {
          await auditService.logAction({
            tenantId,
            userId,
            entityType: 'IMPORT_JOB_CHUNK',
            entityId: jobId,
            action: 'CHUNK_COMMITTED',
            newData: {
              chunkIndex: i / this.CHUNK_SIZE + 1,
              totalChunks,
              medicinesCount: chunkMedicines.length,
              batchesCount: chunkBatches.length,
            },
          });
        }

        logger.info(
          { jobId, chunk: i / this.CHUNK_SIZE + 1, total: totalChunks },
          '[SharedImportEngine] Committed chunk',
        );

        if (onProgress) {
          const processed = Math.min(
            progressTotal || allMedicineIds.length,
            Math.round(
              ((i + chunkMedIds.size) / allMedicineIds.length) *
                (progressTotal || allMedicineIds.length),
            ),
          );

          await onProgress({
            processed,
            total: progressTotal || allMedicineIds.length,
          });
        }
      }
    } finally {
      stopHeartbeat();
      await releaseLock(lockResource);
    }
  }

  async _commitChunkWithRetries(chunkData, retries = 2) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const {
            tenantId,
            branchId,
            chunkMedicines,
            chunkBatches,
            chunkMovements,
            chunkBatchUpdates,
            chunkMedicineUpdates,
            chunkInventoryUpdates,
          } = chunkData;

          // 1. Create Medicines
          if (chunkMedicines.length > 0) {
            await tx.medicine.createMany({ data: chunkMedicines, skipDuplicates: true });
          }

          // 2. Update Existing Medicines
          if (chunkMedicineUpdates.length > 0) {
            for (const upd of chunkMedicineUpdates) {
              await tx.medicine.update({
                where: { id: upd.id },
                data: upd.data,
                select: { id: true },
              });
            }
          }

          // 3. Create Batches
          if (chunkBatches.length > 0) {
            const batchIds = chunkBatches.map((batch) => batch.id);
            const duplicateBatchIds = batchIds.filter(
              (id, index) => batchIds.indexOf(id) !== index,
            );

            if (duplicateBatchIds.length > 0) {
              throw new Error(
                `Duplicate InventoryBatch IDs detected: ${[...new Set(duplicateBatchIds)].join(
                  ', ',
                )}`,
              );
            }

            await tx.inventoryBatch.createMany({
              data: chunkBatches,
            });
          }

          // 4. Update Existing Batches
          if (chunkBatchUpdates.length > 0) {
            for (const upd of chunkBatchUpdates) {
              const batchData = {};

              if (upd.mode === 'SET') {
                if (upd.qty !== undefined) {
                  batchData.quantity = upd.qty;
                  batchData.availableQuantity = upd.qty;
                }
              } else if (upd.qty !== undefined) {
                batchData.quantity = { increment: upd.qty };
                batchData.receivedQuantity = { increment: upd.qty };
                batchData.availableQuantity = { increment: upd.qty };
              }

              // Re-importing a previously cleared batch makes it active again (Rule 2 & 3).
              // Never blindly reactivate all batches.
              if (upd.reactivate) {
                batchData.status = 'ACTIVE';
                batchData.isArchived = false;
                batchData.archivedAt = null;
                batchData.archivedBy = null;
                batchData.archiveReason = null;
              }

              if (upd.purchasePrice !== undefined) batchData.purchasePrice = upd.purchasePrice;
              if (upd.sellingPrice !== undefined) batchData.sellingPrice = upd.sellingPrice;
              if (upd.mrp !== undefined) batchData.mrp = upd.mrp;
              if (upd.expiryDate !== undefined) batchData.expiryDate = upd.expiryDate;

              await tx.inventoryBatch.update({
                where: { id: upd.batchId },
                data:
                  Object.keys(batchData).length > 0
                    ? batchData
                    : { quantity: { increment: upd.qty || 0 } },
              });
            }
          }

          // 5. Create Movements only for valid batches
          if (chunkMovements.length > 0) {
            const movementBatchIds = [
              ...new Set(chunkMovements.map((movement) => movement.batchId).filter(Boolean)),
            ];

            if (movementBatchIds.length > 0) {
              const existingBatches = await tx.inventoryBatch.findMany({
                where: {
                  id: { in: movementBatchIds },
                  tenantId,
                  ...(branchId ? { branchId } : {}),
                },
                select: {
                  id: true,
                },
              });

              const existingBatchIds = new Set(existingBatches.map((batch) => batch.id));

              const invalidMovements = chunkMovements.filter(
                (movement) => !existingBatchIds.has(movement.batchId),
              );

              if (invalidMovements.length > 0) {
                logger.error(
                  {
                    count: invalidMovements.length,
                    batchIds: invalidMovements.map((movement) => movement.batchId),
                    medicineIds: invalidMovements.map((movement) => movement.medicineId),
                  },
                  '[SharedImportEngine] Stock movements reference missing inventory batches',
                );

                throw new Error(
                  `Import integrity failure: ${invalidMovements.length} stock movement(s) reference missing inventory batches`,
                );
              }
            }

            await tx.stockMovement.createMany({
              data: chunkMovements,
              skipDuplicates: true,
            });
          }

          // 6. Reconcile Inventory from Resulting Batches (Rules 5 & 6)
          const affectedMedIds = Array.from(
            new Set([
              ...chunkMedicines.map((m) => m.id),
              ...chunkBatches.map((b) => b.medicineId),
              ...chunkBatchUpdates.map((u) => u.medicineId),
              ...Array.from(chunkInventoryUpdates.keys()),
            ]),
          );

          if (affectedMedIds.length > 0) {
            // Find all active batches for affected medicines to calculate true current stock
            const activeBatchesInTx = await tx.inventoryBatch.findMany({
              where: {
                tenantId,
                ...(branchId ? { branchId } : {}),
                medicineId: { in: affectedMedIds },
                deletedAt: null,
                isArchived: false,
                status: 'ACTIVE',
              },
              select: {
                medicineId: true,
                availableQuantity: true,
                quantity: true,
                expiryDate: true,
              },
            });

            const now = new Date();
            now.setHours(0, 0, 0, 0);

            const stockByMedicine = new Map();
            for (const medId of affectedMedIds) {
              stockByMedicine.set(medId, 0);
            }

            for (const b of activeBatchesInTx) {
              const isExpired = b.expiryDate ? new Date(b.expiryDate) <= now : false;
              if (!isExpired) {
                const qty =
                  b.availableQuantity !== undefined && b.availableQuantity !== null
                    ? b.availableQuantity
                    : b.quantity || 0;
                stockByMedicine.set(
                  b.medicineId,
                  (stockByMedicine.get(b.medicineId) || 0) + Math.max(0, qty),
                );
              }
            }

            // Find existing inventory records
            const existingInvs = await tx.inventory.findMany({
              where: {
                tenantId,
                branchId,
                medicineId: { in: affectedMedIds },
              },
              select: { id: true, medicineId: true, reorderPoint: true },
            });

            const existingInvMap = new Map(existingInvs.map((inv) => [inv.medicineId, inv]));

            for (const medId of affectedMedIds) {
              const actualStock = stockByMedicine.get(medId) || 0;
              const existingInv = existingInvMap.get(medId);
              const reorderPoint = existingInv?.reorderPoint ?? 10;

              let status = 'HEALTHY';
              if (actualStock <= 0) {
                status = 'OUT_OF_STOCK';
              } else if (actualStock <= reorderPoint) {
                status = 'LOW_STOCK';
              }

              if (existingInv) {
                await tx.inventory.update({
                  where: { id: existingInv.id },
                  data: {
                    currentStock: actualStock,
                    status,
                  },
                });
              } else {
                await tx.inventory.create({
                  data: {
                    tenantId,
                    branchId,
                    medicineId: medId,
                    currentStock: actualStock,
                    reorderPoint: 10,
                    status,
                  },
                });
              }
            }
          }
        },
        { timeout: 30000 },
      );
    } catch (err) {
      const nonRetryable =
        err?.code === 'P2003' ||
        err?.code === 'P2002' ||
        err?.code === 'P2025' ||
        err?.message?.startsWith('Import integrity failure:') ||
        err?.message?.startsWith('Duplicate InventoryBatch IDs detected:');

      if (retries > 0 && !nonRetryable) {
        logger.warn(
          { err, retriesRemaining: retries },
          '[SharedImportEngine] Chunk commit failed, retrying...',
        );
        await new Promise((r) => setTimeout(r, 1000));
        return this._commitChunkWithRetries(chunkData, retries - 1);
      }
      throw err;
    }
  }
}

export default new SharedImportEngine();
