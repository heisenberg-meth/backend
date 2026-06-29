import fs from 'fs';
import csv from 'csv-parser';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import { getBullRedis } from '../../../config/redis.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import logger from '../../../shared/utils/logger.js';
import {
  mapDosageFormToPackaging,
  validatePricing,
} from '../../../shared/utils/medicine-helpers.js';
import sharedImportEngine from './shared-import.engine.js';
import { SUBSCRIPTION_PLANS } from '../../subscriptions/subscription.constants.js';

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
  async run(
    filePath,
    {
      jobId,
      tenantId,
      branchId,
      userId,
      duplicateStrategy,
      barcodeOptions,
      supplier: supplierName,
    },
  ) {
    try {
      logger.info({ jobId, filePath }, '[CSV-Import] Starting bulk import');

      let resolvedSupplierId = null;
      if (supplierName && supplierName !== 'None') {
        try {
          const supplier = await prisma.supplier.findFirst({
            where: {
              tenantId,
              name: { equals: supplierName, mode: 'insensitive' },
              deletedAt: null,
            },
            select: { id: true },
          });
          if (supplier) {
            resolvedSupplierId = supplier.id;
          } else {
            throw new Error(`Supplier "${supplierName}" not found in system.`);
          }
        } catch (err) {
          logger.warn({ err }, '[CSV-Import] Supplier lookup failed');
          throw err;
        }
      }

      await updateProgress(jobId, { processed: 0, total: 0, status: 'preloading' });

      const preloadStart = Date.now();
      const medicineMap = await this._preloadMedicines(tenantId);
      const batchMap = await this._preloadBatches(tenantId, branchId);
      const inventoryMap = await this._preloadInventory(tenantId, branchId);
      const categoryMap = await this._preloadCategories(tenantId);
      const manufacturerMap = await this._preloadManufacturers(tenantId);

      // Get subscription limits
      const subscription = await prisma.subscription.findUnique({
        where: { tenantId },
        include: { plan: true },
      });
      const planId = subscription?.planId || 'free';
      const planConfig = SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS['free'];
      const maxMedicines = planConfig.limits ? planConfig.limits['medicines'] : undefined;

      const currentMedicinesCount = await prisma.medicine.count({
        where: { tenantId, deletedAt: null },
      });

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
      let batchQuantityUpdates = [];
      let importedCount = 0;
      const categoriesToCreate = [];
      const manufacturersToCreate = [];

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
                  categoryMap,
                  categoriesToCreate,
                  manufacturerMap,
                  manufacturersToCreate,
                  newMedicines,
                  newBatches,
                  newMovements,
                  inventoryUpdates,
                  errors,
                  batchQuantityUpdates,
                  supplierId: resolvedSupplierId,
                  maxMedicines,
                  currentMedicinesCount,
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
                  categoryMap,
                  categoriesToCreate,
                  manufacturerMap,
                  manufacturersToCreate,
                  newMedicines,
                  newBatches,
                  newMovements,
                  inventoryUpdates,
                  errors,
                  batchQuantityUpdates,
                  supplierId: resolvedSupplierId,
                  maxMedicines,
                  currentMedicinesCount,
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
        batchQuantityUpdates,
        categoriesToCreate,
        manufacturersToCreate,
      });
      logger.info({ jobId, elapsed: Date.now() - commitStart }, '[CSV-Import] Commit complete');

      const summary = {
        totalRows,
        imported: importedCount,
        duplicates: 0,
        failed: errors.length,
        warnings: 0,
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
    } catch (error) {
      logger.error({ jobId, error }, '[CSV-Import] Import failed');
      await updateProgress(jobId, { status: 'failed', error: error.message });
      try {
        await prisma.importJob.update({
          where: { id: jobId },
          data: {
            importStatus: 'FAILED',
            extractedData: { error: error.message },
          },
        });
      } catch (dbErr) {
        logger.error({ jobId, dbErr }, '[CSV-Import] Failed to update importJob status to FAILED');
      }
      throw error;
    }
  }

  async _preloadCategories(tenantId) {
    const cats = await prisma.medicineCategory.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const map = new Map();
    for (const c of cats) {
      map.set(c.name.toLowerCase().trim(), c.id);
    }
    return map;
  }

  async _preloadManufacturers(tenantId) {
    const mfrs = await prisma.manufacturer.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    const map = new Map();
    for (const m of mfrs) {
      map.set(m.name.toLowerCase().trim(), m.id);
    }
    return map;
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

  _getColumn(row, aliases, excludes = []) {
    const keys = Object.keys(row);

    // First try: Case-insensitive exact match
    for (const alias of aliases) {
      const match = keys.find((k) => {
        const lowerKey = k.toLowerCase().trim();
        const lowerAlias = alias.toLowerCase().trim();
        if (lowerKey === lowerAlias) {
          const hasExclude = excludes.some((ex) => lowerKey.includes(ex.toLowerCase()));
          if (!hasExclude) return true;
        }
        return false;
      });
      if (match !== undefined) return row[match];
    }

    // Second try: Case-insensitive substring match
    for (const alias of aliases) {
      const match = keys.find((k) => {
        const lowerKey = k.toLowerCase().trim();
        const lowerAlias = alias.toLowerCase().trim();
        if (lowerKey.includes(lowerAlias)) {
          const hasExclude = excludes.some((ex) => lowerKey.includes(ex.toLowerCase()));
          if (!hasExclude) return true;
        }
        return false;
      });
      if (match !== undefined) return row[match];
    }

    return '';
  }

  _parseQuantity(val) {
    if (val === undefined || val === null) return NaN;
    const clean = String(val)
      .trim()
      .replace(/,/g, '')
      .replace(/[^0-9.-]/g, '');
    if (clean === '') return NaN;
    const num = parseFloat(clean);
    return isNaN(num) ? NaN : Math.round(num);
  }

  _parsePrice(val) {
    if (val === undefined || val === null) return NaN;
    const clean = String(val)
      .trim()
      .replace(/,/g, '')
      .replace(/[^0-9.-]/g, '');
    if (clean === '') return NaN;
    const num = parseFloat(clean);
    return isNaN(num) ? NaN : num;
  }

  _parseGst(val) {
    if (val === undefined || val === null) return 0;
    const clean = String(val)
      .trim()
      .replace(/%/g, '')
      .replace(/,/g, '')
      .replace(/[^0-9.-]/g, '');
    if (clean === '') return 0;
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  _processChunk(rows, ctx) {
    const { tenantId, branchId, userId, duplicateStrategy, barcodeOptions, medicineMap, batchMap } =
      ctx;

    for (const row of rows) {
      const name = this._getColumn(
        row,
        ['name', 'med', 'medicine', 'drug', 'item'],
        [
          'generic',
          'price',
          'rate',
          'cost',
          'qty',
          'quantity',
          'stock',
          'expiry',
          'date',
          'batch',
          'barcode',
          'sku',
        ],
      );
      const qtyStr = this._getColumn(
        row,
        ['qty', 'quantity', 'stock', 'unit', 'units', 'count', 'on hand', 'available'],
        [
          'price',
          'rate',
          'cost',
          'inr',
          'date',
          'expiry',
          'name',
          'med',
          'batch',
          'barcode',
          'sku',
        ],
      );
      const expiryStr = this._getColumn(
        row,
        ['expiry', 'exp', 'date', 'valid'],
        ['name', 'med', 'price', 'qty', 'batch', 'barcode', 'sku'],
      );
      const priceStr = this._getColumn(
        row,
        ['price', 'rate', 'cost', 'inr'],
        [
          'qty',
          'quantity',
          'stock',
          'units',
          'count',
          'name',
          'med',
          'expiry',
          'date',
          'batch',
          'barcode',
          'sku',
        ],
      );
      const batchNo = this._getColumn(
        row,
        ['batch', 'lot', 'no', 'code'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'barcode', 'hsn'],
      );
      const barcode = this._getColumn(
        row,
        ['barcode', 'upc', 'ean', 'sku'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch'],
      );
      const category = this._getColumn(
        row,
        ['category', 'cat', 'type', 'group', 'classification'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode', 'generic'],
      );
      const manufacturer = this._getColumn(
        row,
        ['manufacturer', 'mfr', 'maker', 'brand', 'company', 'vendor'],
        [
          'name',
          'med',
          'price',
          'qty',
          'expiry',
          'date',
          'batch',
          'barcode',
          'generic',
          'category',
        ],
      );
      const genericName = this._getColumn(
        row,
        ['generic', 'gen', 'salt', 'composition'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode'],
      );
      const strength = this._getColumn(
        row,
        ['strength', 'mg', 'ml', 'dose', 'concentration'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode'],
      );
      const dosageForm = this._getColumn(
        row,
        ['dosage', 'form', 'type', 'drug_form'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode'],
      );
      const hsnCode = this._getColumn(
        row,
        ['hsn', 'hsn_code', 'hsncode', 'sac', 'tariff'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode'],
      );
      const gstStr = this._getColumn(
        row,
        ['gst', 'gst%', 'tax', 'tax_percent', 'gst_percent'],
        ['name', 'med', 'price', 'qty', 'expiry', 'date', 'batch', 'barcode'],
      );

      if (!name) {
        logger.warn(
          { rowNum: ctx.importedCount + ctx.newMedicines.length + 1, rawRow: row },
          '[CSV-Import] Medicine name is required',
        );
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          field: 'name',
          value: '',
          errorCode: 'MISSING_REQUIRED_FIELD',
          message: 'Medicine name is required',
        });
        continue;
      }

      const qty = this._parseQuantity(qtyStr);
      if (isNaN(qty) || qty <= 0) {
        logger.warn(
          { rowNum: ctx.importedCount + ctx.newMedicines.length + 1, name, qtyStr, rawRow: row },
          '[CSV-Import] Invalid quantity during import',
        );
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          field: 'quantity',
          value: qtyStr,
          errorCode: 'INVALID_QUANTITY',
          message: 'Quantity must be greater than zero',
        });
        continue;
      }

      const price = this._parsePrice(priceStr);
      const pricingError = validatePricing({
        purchasePrice: price,
        sellingPrice: price * 1.2,
        mrp: price * 1.2,
      });
      if (pricingError) {
        logger.warn(
          {
            rowNum: ctx.importedCount + ctx.newMedicines.length + 1,
            name,
            priceStr,
            pricingError,
            rawRow: row,
          },
          '[CSV-Import] Pricing validation failed',
        );
        ctx.errors.push({
          row: ctx.importedCount + ctx.newMedicines.length + 1,
          name: name || 'Unknown',
          reason: pricingError,
          field: 'price',
          value: priceStr,
          errorCode: 'INVALID_PRICE',
          message: pricingError,
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
        /*
        ======================================================
        Future Feature

        Medicine Count Limits

        Enable this block only if subscription plans
        need medicine quantity restrictions.

        Current Business Decision:
        Unlimited medicines for all tenants.

        Date Disabled:
        2026

        ======================================================
        if (ctx.maxMedicines !== undefined && ctx.maxMedicines !== -1) {
          const currentTotal = ctx.currentMedicinesCount + ctx.newMedicines.length;
          if (currentTotal >= ctx.maxMedicines) {
            logger.warn(
              {
                rowNum: ctx.importedCount + ctx.newMedicines.length + 1,
                name,
                maxMedicines: ctx.maxMedicines,
              },
              '[CSV-Import] Plan Limit Reached',
            );
            ctx.errors.push({
              row: ctx.importedCount + ctx.newMedicines.length + 1,
              name: name || 'Unknown',
              reason: 'Plan Limit Reached',
              field: 'plan',
              value: ctx.maxMedicines,
              errorCode: 'PLAN_LIMIT_REACHED',
              message: 'Plan Limit Reached',
            });
            continue;
          }
        }
        */

        let resolvedCategoryId = null;
        if (category) {
          const normalizedCat = category.toLowerCase().trim();
          if (ctx.categoryMap.has(normalizedCat)) {
            resolvedCategoryId = ctx.categoryMap.get(normalizedCat);
          } else {
            const alreadyQueued = ctx.categoriesToCreate.some(
              (c) => c.name.toLowerCase().trim() === normalizedCat,
            );
            if (!alreadyQueued) {
              ctx.categoriesToCreate.push({ tenantId, name: category.trim() });
            }
          }
        }

        let resolvedManufacturerId = null;
        if (manufacturer) {
          const normalizedMfr = manufacturer.toLowerCase().trim();
          if (ctx.manufacturerMap.has(normalizedMfr)) {
            resolvedManufacturerId = ctx.manufacturerMap.get(normalizedMfr);
          } else {
            const alreadyQueued = ctx.manufacturersToCreate.some(
              (m) => m.name.toLowerCase().trim() === normalizedMfr,
            );
            if (!alreadyQueued) {
              ctx.manufacturersToCreate.push({ tenantId, name: manufacturer.trim() });
            }
          }
        }

        const parsedGst = parseFloat(gstStr);
        const newMed = {
          tenantId,
          userId,
          name: name.trim(),
          barcode: barcode || null,
          sku: `SKU-${crypto.randomUUID()}`,
          genericName: genericName || null,
          strength: strength || null,
          dosageForm: dosageForm || null,
          packagingType: mapDosageFormToPackaging(dosageForm),
          hsnCode: hsnCode || null,
          gstPercentage: isNaN(parsedGst) ? 0 : parsedGst,
          reorderLevel: 10,
          status: 'ACTIVE',
          isActive: true,
          categoryId: resolvedCategoryId,
          _categoryName: resolvedCategoryId ? null : category ? category.trim() : null,
          manufacturerId: resolvedManufacturerId,
          _manufacturerName: resolvedManufacturerId
            ? null
            : manufacturer
              ? manufacturer.trim()
              : null,
        };
        medicineId = crypto.randomUUID();
        newMed.id = medicineId;
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
      const existingEntry = batchMap.get(batchKey);

      let targetBatchId = null;

      if (existingEntry) {
        targetBatchId = existingEntry.id;
        if (existingEntry.isNew) {
          ctx.newBatches[existingEntry.index].quantity += qty;
          ctx.newBatches[existingEntry.index].receivedQuantity += qty;
          ctx.newBatches[existingEntry.index].availableQuantity += qty;
        } else {
          ctx.batchQuantityUpdates.push({ batchId: targetBatchId, qty, medicineId });
        }
      } else {
        targetBatchId = crypto.randomUUID();
        ctx.newBatches.push({
          id: targetBatchId,
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
          supplierId: ctx.supplierId || null,
        });
        batchMap.set(batchKey, {
          id: targetBatchId,
          isNew: true,
          index: ctx.newBatches.length - 1,
        });
      }

      ctx.newMovements.push({
        id: crypto.randomUUID(),
        tenantId,
        branchId,
        medicineId,
        movementType: 'PURCHASE',
        quantity: qty,
        referenceType: 'BULK_IMPORT',
        performedBy: userId,
        notes: `Bulk imported from CSV`,
        batchId: targetBatchId,
        idempotencyKey: `import-${ctx.jobId}-${targetBatchId}-${crypto.randomUUID()}`,
      });

      ctx.inventoryUpdates.push({ medicineId, qty });
      ctx.importedCount++;
    }
  }

  async _commitAll(ctx) {
    const commitStart = Date.now();
    await sharedImportEngine.commitChunks(ctx);

    await prisma.importJob.update({
      where: { id: ctx.jobId },
      data: {
        importStatus: 'COMPLETED',
        processedAt: new Date(),
        extractedData: {
          totalRows: ctx.importedCount,
          errors: ctx.errors.slice(0, 100),
          newMedicines: ctx.newMedicines.length,
          newBatches: ctx.newBatches.length,
        },
      },
    });

    logger.info(
      {
        event: 'IMPORT_PERFORMANCE',
        phase: 'CHUNK_COMMIT',
        durationMs: Date.now() - commitStart,
        rows: ctx.importedCount,
      },
      'All chunks committed successfully',
    );
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
    } catch (err) {
      logger.error({ jobId, error: err.message }, 'Failed to get import progress from Redis');
      return null;
    }
  }
}

export default new CsvImportService();
