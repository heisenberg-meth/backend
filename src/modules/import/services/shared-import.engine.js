import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import auditService from '../../audit/service/audit.service.js';

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
    newMedicines,
    newBatches,
    newMovements,
    inventoryUpdates,
    batchQuantityUpdates,
    medicineUpdates,
    categoriesToCreate,
    manufacturersToCreate,
  }) {
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

          // 1b. Update Existing Medicines
          if (chunkMedicineUpdates.length > 0) {
            for (const upd of chunkMedicineUpdates) {
              await tx.medicine.update({
                where: { id: upd.id },
                data: upd.data,
                select: { id: true },
              });
            }
          }

          // 2. Create Batches
          if (chunkBatches.length > 0) {
            await tx.inventoryBatch.createMany({ data: chunkBatches, skipDuplicates: true });
          }

          // 3. Update Existing Batches
          if (chunkBatchUpdates.length > 0) {
            for (const upd of chunkBatchUpdates) {
              await tx.inventoryBatch.update({
                where: { id: upd.batchId },
                data: {
                  quantity: { increment: upd.qty },
                  receivedQuantity: { increment: upd.qty },
                  availableQuantity: { increment: upd.qty },
                },
              });
            }
          }

          // 4. Upsert Inventory
          if (chunkInventoryUpdates.size > 0) {
            const medIds = Array.from(chunkInventoryUpdates.keys());

            // Find existing inventory records
            const existingInvs = await tx.inventory.findMany({
              where: {
                tenantId,
                branchId,
                medicineId: { in: medIds },
              },
              select: { medicineId: true },
            });

            const existingSet = new Set(existingInvs.map((i) => i.medicineId));
            const toCreate = [];
            const toUpdate = [];

            for (const [medId, qty] of chunkInventoryUpdates.entries()) {
              if (existingSet.has(medId)) {
                toUpdate.push({ medicineId: medId, qty });
              } else {
                toCreate.push({
                  tenantId,
                  branchId,
                  medicineId: medId,
                  currentStock: qty,
                  reorderPoint: 10,
                });
              }
            }

            if (toCreate.length > 0) {
              await tx.inventory.createMany({ data: toCreate, skipDuplicates: true });
            }

            if (toUpdate.length > 0) {
              for (const upd of toUpdate) {
                await tx.inventory.update({
                  where: {
                    tenantId_branchId_medicineId: {
                      tenantId,
                      branchId,
                      medicineId: upd.medicineId,
                    },
                  },
                  data: { currentStock: { increment: upd.qty } },
                });
              }
            }
          }

          // 5. Create Movements
          if (chunkMovements.length > 0) {
            await tx.stockMovement.createMany({ data: chunkMovements, skipDuplicates: true });
          }
        },
        { timeout: 30000 },
      );
    } catch (err) {
      if (retries > 0) {
        logger.warn({ err }, '[SharedImportEngine] Chunk commit failed, retrying...');
        await new Promise((r) => setTimeout(r, 1000));
        return this._commitChunkWithRetries(chunkData, retries - 1);
      }
      throw err;
    }
  }
}

export default new SharedImportEngine();
