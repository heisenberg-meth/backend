import fs from 'fs';
import csv from 'csv-parser';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import { getBullRedis } from '../../../config/redis.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import logger from '../../../shared/utils/logger.js';

const CHUNK_SIZE = 1000;

function progressKey(jobId) {
  return `import:${jobId}:progress`;
}

async function updateProgress(jobId, data) {
  try {
    const redis = getBullRedis();
    await redis.set(progressKey(jobId), JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, '[CSV-Import] Redis progress update failed');
  }
}

class CsvImportService {
  async run(filePath, { jobId, tenantId, branchId, userId, duplicateStrategy, barcodeOptions }) {
    logger.info({ jobId, filePath }, '[CSV-Import] Starting bulk import');

    await updateProgress(jobId, { processed: 0, total: 0, status: 'preloading' });

    const preloadStart = Date.now();
    const medicineMap = await this._preloadMedicines(tenantId);
    const batchMap = await this._preloadBatches(tenantId, branchId);
    const inventoryMap = await this._preloadInventory(tenantId, branchId);
    logger.info(
      { jobId, elapsed: Date.now() - preloadStart, size: medicineMap.size },
      '[CSV-Import] Preload complete',
    );

    await updateProgress(jobId, { processed: 0, total: 0, status: 'parsing' });

    let totalRows = 0;
    let chunk = [];
    let newMedicines = [];
    let newBatches = [];
    let newMovements = [];
    let inventoryUpdates = [];
    let errors = [];
    let importedCount = 0;

    await new Promise((resolve, reject) => {
      const stream = fs
        .createReadStream(filePath, { encoding: 'utf-8' })
        .pipe(
          csv({
            mapHeaders: ({ header }) => header.trim(),
            mapValues: ({ value }) => (value ? value.trim() : ''),
            skipLines: 0,
          }),
        )
        .on('data', (row) => {
          totalRows++;
          chunk.push(row);
          if (chunk.length >= CHUNK_SIZE) {
            stream.pause();
            try {
              this._processChunk(chunk, {
                tenantId,
                branchId,
                userId,
                duplicateStrategy,
                barcodeOptions,
                medicineMap,
                batchMap,
                inventoryMap,
                newMedicines,
                newBatches,
                newMovements,
                inventoryUpdates,
                errors,
              });
              importedCount += chunk.length;
              chunk = [];
              updateProgress(jobId, {
                processed: importedCount,
                total: totalRows,
                status: 'processing',
              });
            } catch (err) {
              logger.error({ err, jobId }, '[CSV-Import] Chunk process error');
            }
            stream.resume();
          }
        })
        .on('end', async () => {
          if (chunk.length > 0) {
            try {
              this._processChunk(chunk, {
                tenantId,
                branchId,
                userId,
                duplicateStrategy,
                barcodeOptions,
                medicineMap,
                batchMap,
                inventoryMap,
                newMedicines,
                newBatches,
                newMovements,
                inventoryUpdates,
                errors,
              });
              importedCount += chunk.length;
            } catch (err) {
              logger.error({ err, jobId }, '[CSV-Import] Final chunk process error');
            }
          }
          resolve();
        })
        .on('error', (err) => reject(err));
    });

    await updateProgress(jobId, {
      processed: importedCount,
      total: totalRows,
      status: 'committing',
    });

    const commitStart = Date.now();
    await this._commitAll({
      tenantId,
      branchId,
      jobId,
      newMedicines,
      newBatches,
      newMovements,
      inventoryUpdates,
      errors,
    });
    logger.info({ jobId, elapsed: Date.now() - commitStart }, '[CSV-Import] Commit complete');

    const summary = {
      totalRows,
      importedCount,
      newMedicinesCount: newMedicines.length,
      newBatchesCount: newBatches.length,
      errors: errors.slice(0, 100),
    };

    try {
      fs.unlinkSync(filePath);
    } catch {
      logger.warn({ filePath }, '[CSV-Import] Cleanup failed');
    }

    await updateProgress(jobId, {
      processed: importedCount,
      total: totalRows,
      status: 'complete',
      summary,
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'BULK_IMPORT_COMPLETED',
      target: jobId,
      type: 'INVENTORY',
      metadata: summary,
    });

    logger.info({ jobId, summary }, '[CSV-Import] Import complete');
    return summary;
  }

  async _preloadMedicines(tenantId) {
    const meds = await prisma.medicine.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, barcode: true },
    });
    const map = new Map();
    for (const m of meds) {
      const key = m.name.toLowerCase().trim();
      map.set(key, m);
      if (m.barcode) map.set(`barcode:${m.barcode}`, m);
    }
    return map;
  }

  async _preloadBatches(tenantId, branchId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: { tenantId, branchId, deletedAt: null },
      select: { id: true, medicineId: true, batchNumber: true, barcode: true },
    });
    const map = new Map();
    for (const b of batches) {
      const key = `${b.medicineId}:${b.batchNumber}`.toLowerCase();
      map.set(key, b);
    }
    return map;
  }

  async _preloadInventory(tenantId, branchId) {
    const items = await prisma.inventory.findMany({
      where: { tenantId, branchId },
      select: { medicineId: true, currentStock: true, id: true },
    });
    const map = new Map();
    for (const inv of items) {
      map.set(inv.medicineId, inv);
    }
    return map;
  }

  _getColumn(row, aliases) {
    const keys = Object.keys(row);
    for (const alias of aliases) {
      const match = keys.find((k) => k.toLowerCase().includes(alias));
      if (match) return row[match];
    }
    return '';
  }

  _processChunk(rows, ctx) {
    const { tenantId, branchId, userId, duplicateStrategy, barcodeOptions, medicineMap, batchMap } =
      ctx;

    for (const row of rows) {
      const name = this._getColumn(row, ['name', 'med', 'medicine', 'drug', 'item']);
      const qtyStr = this._getColumn(row, ['qty', 'quantity', 'stock', 'units', 'count']);
      const expiryStr = this._getColumn(row, ['expiry', 'exp', 'date', 'valid']);
      const priceStr = this._getColumn(row, ['price', 'rate', 'cost', 'inr']);
      const batchNo = this._getColumn(row, ['batch', 'lot', 'no', 'code']);
      const barcode = this._getColumn(row, ['barcode', 'upc', 'ean', 'sku']);

      if (!name) {
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          reason: 'Medicine name is required',
        });
        continue;
      }

      const qty = parseInt(qtyStr, 10);
      if (isNaN(qty) || qty <= 0) {
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          name,
          reason: 'Quantity must be greater than zero',
        });
        continue;
      }

      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) {
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          name,
          reason: 'Invalid price',
        });
        continue;
      }

      let expiryDate = null;
      if (expiryStr) {
        expiryDate = this._parseDate(expiryStr);
      }

      const normalizedName = name.toLowerCase().trim();
      let existingMedicine = medicineMap.get(normalizedName);

      if (!existingMedicine && barcode) {
        existingMedicine = medicineMap.get(`barcode:${barcode}`);
      }

      if (existingMedicine) {
        if (duplicateStrategy === 'Skip') {
          ctx.importedCount++;
          continue;
        }
      }

      let medicineId;
      if (existingMedicine) {
        medicineId = existingMedicine.id;
      } else {
        const newMed = {
          tenantId,
          userId,
          name: name.trim(),
          barcode: barcode || null,
          sku: `SKU-${crypto.randomUUID()}`,
          gstPercentage: 0,
          reorderLevel: 10,
          status: 'ACTIVE',
          isActive: true,
        };
        medicineId = `new:${crypto.randomUUID()}`;
        newMed._tempId = medicineId;
        ctx.newMedicines.push(newMed);
        medicineMap.set(normalizedName, { id: medicineId, name: name.trim(), barcode });
        if (barcode)
          medicineMap.set(`barcode:${barcode}`, { id: medicineId, name: name.trim(), barcode });
      }

      const finalBarcode =
        barcode || (barcodeOptions?.autoGen ? `BC-${crypto.randomUUID()}` : null);
      const finalBatchNo = batchNo || `IMP-${crypto.randomUUID().toUpperCase()}`;

      const batchKey = `${medicineId}:${finalBatchNo}`.toLowerCase();
      if (!batchMap.has(batchKey)) {
        ctx.newBatches.push({
          tenantId,
          medicineId,
          branchId,
          batchNumber: finalBatchNo,
          barcode: finalBarcode,
          quantity: qty,
          receivedQuantity: qty,
          availableQuantity: qty,
          expiryDate: expiryDate || new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
          purchasePrice: price,
          sellingPrice: price * 1.2,
          mrp: price * 1.2,
          status: 'ACTIVE',
        });
        batchMap.set(batchKey, true);
      }

      ctx.newMovements.push({
        tenantId,
        branchId,
        medicineId,
        movementType: 'PURCHASE',
        quantity: qty,
        referenceType: 'BULK_IMPORT',
        performedBy: userId,
        notes: `Bulk imported from CSV`,
      });

      ctx.inventoryUpdates.push({ medicineId, qty });
      ctx.importedCount++;
    }
  }

  async _commitAll(ctx) {
    const {
      tenantId,
      branchId,
      jobId,
      newMedicines,
      newBatches,
      newMovements,
      inventoryUpdates,
      errors,
    } = ctx;
    const medicineIdMap = new Map();

    await prisma.$transaction(async (tx) => {
      // P0 Fix: Create medicines sequentially to reliably get IDs
      for (const m of newMedicines) {
        const { _tempId, ...data } = m;
        const created = await tx.medicine.create({ data });
        medicineIdMap.set(_tempId, created.id);
      }
      logger.info({ count: newMedicines.length }, '[CSV-Import] Created medicines');

      if (newBatches.length > 0) {
        const resolved = newBatches.map((b) => ({
          ...b,
          medicineId: medicineIdMap.get(b.medicineId) || b.medicineId,
        }));
        await tx.inventoryBatch.createMany({ data: resolved, skipDuplicates: true });
        logger.info({ count: resolved.length }, '[CSV-Import] Created batches');
      }

      for (const inv of inventoryUpdates) {
        const resolvedMedId = medicineIdMap.get(inv.medicineId) || inv.medicineId;
        await tx.inventory.upsert({
          where: {
            tenantId_branchId_medicineId: { tenantId, branchId, medicineId: resolvedMedId },
          },
          update: { currentStock: { increment: inv.qty } },
          create: {
            tenantId,
            branchId,
            medicineId: resolvedMedId,
            currentStock: inv.qty,
            reorderPoint: 10,
          },
        });
      }

      if (newMovements.length > 0) {
        const resolved = newMovements.map((m) => ({
          ...m,
          medicineId: medicineIdMap.get(m.medicineId) || m.medicineId,
          idempotencyKey: `import-${jobId}-${m.medicineId}-${crypto.randomUUID()}`,
        }));
        await tx.stockMovement.createMany({ data: resolved });
        logger.info({ count: resolved.length }, '[CSV-Import] Created movements');
      }

      await tx.importJob.update({
        where: { id: jobId },
        data: {
          importStatus: errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
          processedAt: new Date(),
          extractedData: {
            totalRows: ctx.importedCount,
            errors: errors.slice(0, 100),
            newMedicines: newMedicines.length,
            newBatches: newBatches.length,
          },
        },
      });
    });
  }

  _parseDate(str) {
    if (!str) return null;
    const trimmed = String(str).trim();
    const numVal = Number(trimmed);
    if (!isNaN(numVal) && numVal > 10000 && numVal < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + numVal * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
    let d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
    const parts = trimmed.split(/[-/.\s]/);
    if (parts.length === 3) {
      const a = parseInt(parts[0], 10),
        b = parseInt(parts[1], 10),
        c = parseInt(parts[2], 10);
      if (a > 1000 && b >= 1 && b <= 12 && c >= 1 && c <= 31) return new Date(a, b - 1, c);
      if (c > 1000 && a >= 1 && a <= 31 && b >= 1 && b <= 12) return new Date(c, b - 1, a);
    }
    return null;
  }

  async getProgress(jobId) {
    try {
      const redis = getBullRedis();
      const data = await redis.get(progressKey(jobId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}

export default new CsvImportService();
