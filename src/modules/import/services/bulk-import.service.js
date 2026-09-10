import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import logger from '../../../shared/utils/logger.js';
import { getBullRedis } from '../../../config/redis.js';
import {
  mapDosageFormToPackaging,
  validatePricing,
} from '../../../shared/utils/medicine-helpers.js';

const progressKey = (jobId) => `import:${jobId}:progress`;

async function updateBulkProgress(jobId, data) {
  try {
    if (process.env.NODE_ENV === 'test') return;
    const redis = getBullRedis();
    await redis.set(progressKey(jobId), JSON.stringify(data));
  } catch (err) {
    logger.warn({ err }, '[Bulk Import] Redis progress update failed');
  }
}

class BulkImportService {
  async analyze(payload, tenantId, branchId, userId) {
    return this._processBulkImport(payload, tenantId, branchId, userId, true);
  }

  async commit(payload, tenantId, branchId, userId, options = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload');
    }

    // In test environment, unless queue is explicitly requested, run synchronously
    // to support unit test suites where BullMQ workers are disabled
    if (process.env.NODE_ENV === 'test' && !options.queued) {
      return this._processBulkImport(payload, tenantId, branchId, userId, false);
    }

    const medicines = Array.isArray(payload.medicines) ? payload.medicines : [];

    const job = await prisma.importJob.create({
      data: {
        tenantId,
        importType: 'BULK_MEDICINES',
        importStatus: 'PROCESSING',
        uploadedBy: userId,
        fileName: payload.fileName || 'bulk_import.csv',
        extractedData: payload,
      },
    });

    await updateBulkProgress(job.id, {
      processed: 0,
      total: medicines.length,
      percentage: 0,
      status: 'queued',
    });

    try {
      const { mainQueue } = await import('../../../queue/index.js');

      await mainQueue.add('bulk-medicines-bulk-commit', {
        jobId: job.id,
        tenantId,
        branchId,
        userId,
      });

      return {
        success: true,
        queued: true,
        jobId: job.id,
        status: 'queued',
        total: medicines.length,
        message: 'Bulk import queued for processing.',
      };
    } catch (error) {
      await prisma.importJob.update({
        where: { id: job.id },
        data: {
          importStatus: 'FAILED',
        },
      });

      throw error;
    }
  }

  async processQueuedCommit(jobId, tenantId, branchId, userId) {
    const job = await prisma.importJob.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
    });

    if (!job) {
      throw new Error(`Import job ${jobId} not found.`);
    }

    const payload =
      job.extractedData && typeof job.extractedData === 'object' ? job.extractedData : {};

    const total = Array.isArray(payload.medicines) ? payload.medicines.length : 0;

    try {
      await updateBulkProgress(jobId, {
        processed: 0,
        total,
        percentage: 0,
        status: 'processing',
      });

      const result = await this._processBulkImport(
        payload,
        tenantId,
        branchId,
        userId,
        false,
        jobId,
      );

      await updateBulkProgress(jobId, {
        processed: total,
        total,
        percentage: 100,
        status: 'complete',
        summary: result.summary,
      });

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          importStatus: 'COMPLETED',
          processedAt: new Date(),
          extractedData: {
            ...payload,
            summary: result.summary,
          },
        },
      });

      return result;
    } catch (error) {
      await updateBulkProgress(jobId, {
        processed: 0,
        total,
        percentage: 0,
        status: 'failed',
        error: error.message,
      });

      await prisma.importJob.update({
        where: { id: jobId },
        data: {
          importStatus: 'FAILED',
          errorMessage: error.message,
          extractedData: {
            ...payload,
            error: error.message,
          },
        },
      });

      throw error;
    }
  }

  async _processBulkImport(payload, tenantId, branchId, userId, isDryRun, jobId = null) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload');
    }

    const {
      medicines = [],
      supplier: supplierName = 'None',
      duplicateStrategy = 'Skip',
      duplicateDecisions = {},
      importType = 'New Medicines',
      barcodeOptions = { autoGen: true, overwrite: false, validate: true },
      processExistingMedicines = false,
    } = payload;

    const isProcessExisting = processExistingMedicines === true;

    if (!Array.isArray(medicines)) {
      throw new Error('medicines must be an array');
    }

    let resolvedSupplierId = null;
    if (supplierName && supplierName !== 'None') {
      const supplier = await prisma.supplier.findFirst({
        where: { tenantId, name: { equals: supplierName, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
      });
      if (supplier) {
        resolvedSupplierId = supplier.id;
      } else {
        throw new Error(`Supplier "${supplierName}" not found in system.`);
      }
    }

    const analysis = {
      new: 0,
      duplicates: 0,
      conflicts: 0,
      existingMedicines: 0,
      willProcess: 0,
      willSkip: 0,
      rows: [],
      errors: [],
      readyCount: 0,
      validBarcodes: 0,
      autoGenBarcodes: 0,
    };

    const preValidatedRows = [];
    const namesToLookup = new Set();
    const barcodesToLookup = new Set();

    for (let index = 0; index < medicines.length; index++) {
      const rawRow = medicines[index];
      const name = rawRow.name ? String(rawRow.name).trim() : '';
      const barcode = rawRow.barcode ? String(rawRow.barcode).trim().replace(/-/g, '') : '';
      if (name) namesToLookup.add(name.toLowerCase());
      if (barcode) barcodesToLookup.add(barcode);
    }

    const existingMedicines = [];
    const BATCH_SIZE = 500;
    const namesArray = Array.from(namesToLookup);
    const barcodesArray = Array.from(barcodesToLookup);

    for (let i = 0; i < namesArray.length; i += BATCH_SIZE) {
      const batchNames = namesArray.slice(i, i + BATCH_SIZE);
      const batchResult = await prisma.medicine.findMany({
        where: {
          tenantId,
          deletedAt: null,
          name: {
            in: batchNames,
            mode: 'insensitive',
          },
        },
        select: {
          id: true,
          name: true,
          barcode: true,
          categoryId: true,
          manufacturerId: true,
          genericName: true,
          strength: true,
          dosageForm: true,
          hsnCode: true,
          gstPercentage: true,
          scheduleType: true,
        },
      });
      existingMedicines.push(...batchResult);
    }

    for (let i = 0; i < barcodesArray.length; i += BATCH_SIZE) {
      const batchBarcodes = barcodesArray.slice(i, i + BATCH_SIZE);
      const batchResult = await prisma.medicine.findMany({
        where: {
          tenantId,
          deletedAt: null,
          barcode: {
            in: batchBarcodes,
          },
        },
        select: {
          id: true,
          name: true,
          barcode: true,
          categoryId: true,
          manufacturerId: true,
          genericName: true,
          strength: true,
          dosageForm: true,
          hsnCode: true,
          gstPercentage: true,
          scheduleType: true,
        },
      });
      existingMedicines.push(...batchResult);
    }

    const medicineMapByName = new Map();
    const medicineMapByBarcode = new Map();
    const medicineMapByComposite = new Map();

    for (const med of existingMedicines) {
      if (med.name) {
        const normName = med.name.toLowerCase().trim();
        medicineMapByName.set(normName, med);
        const compositeKey = `${normName}::${(med.strength || '').toLowerCase().trim()}::${(med.dosageForm || '').toLowerCase().trim()}`;
        medicineMapByComposite.set(compositeKey, med);
      }
      if (med.barcode) {
        medicineMapByBarcode.set(med.barcode.trim().replace(/-/g, ''), med);
      }
    }

    for (let index = 0; index < medicines.length; index++) {
      const rawRow = medicines[index];
      const rowNum = index + 1;

      const name = rawRow.name ? String(rawRow.name).trim() : '';
      const qtyStr =
        rawRow.qty !== undefined && rawRow.qty !== null ? String(rawRow.qty).trim() : '';
      const expiryStr = rawRow.expiry ? String(rawRow.expiry).trim() : '';
      const priceStr =
        rawRow.price !== undefined && rawRow.price !== null ? String(rawRow.price).trim() : '';
      const batch = rawRow.batch ? String(rawRow.batch).trim() : '';
      const rawBarcode = rawRow.barcode ? String(rawRow.barcode).trim() : '';
      const barcode = rawBarcode.replace(/-/g, '');
      const category = rawRow.category ? String(rawRow.category).trim() : '';
      const manufacturer = rawRow.manufacturer ? String(rawRow.manufacturer).trim() : '';
      const genericName = rawRow.genericName ? String(rawRow.genericName).trim() : '';
      const strength = rawRow.strength ? String(rawRow.strength).trim() : '';
      const dosageForm = rawRow.dosageForm ? String(rawRow.dosageForm).trim() : '';
      const scheduleRaw = rawRow.schedule ? String(rawRow.schedule).trim() : '';
      const schedule = this._normalizeSchedule(scheduleRaw);
      const hsnCode = rawRow.hsnCode ? String(rawRow.hsnCode).trim() : '';
      const gstPercentage = this._parseGst(rawRow.gstPercentage);

      const validationErrors = [];
      const validationWarnings = [];

      // PRD §8.1: Medicine Name - min 2 non-whitespace characters
      if (!name || name.replace(/\s+/g, '').length < 2) {
        validationErrors.push({
          field: 'name',
          value: name,
          errorCode: 'INVALID_NAME',
          message:
            'Medicine name is required and must contain at least 2 non-whitespace characters',
        });
      }

      // PRD §8.1: Quantity - positive integer
      const qty = this._parseQuantity(qtyStr);
      if (isNaN(qty) || qty <= 0) {
        validationErrors.push({
          field: 'quantity',
          value: qtyStr,
          errorCode: 'INVALID_QUANTITY',
          message: qtyStr
            ? `Expected a positive number (> 0), received "${qtyStr}"`
            : 'Quantity is empty or zero',
        });
      }

      // PRD §8.3: Expiry date normalization and past-expiry detection
      let expiryDate = null;
      let isExpired = false;
      if (expiryStr) {
        expiryDate = this.parseExpiryDate(expiryStr);
        if (!expiryDate) {
          validationErrors.push({
            field: 'expiryDate',
            value: expiryStr,
            errorCode: 'INVALID_DATE',
            message: `Invalid expiry date format: "${expiryStr}"`,
          });
        } else if (expiryDate <= new Date()) {
          isExpired = true;

          validationErrors.push({
            field: 'expiryDate',
            value: expiryStr,
            errorCode: 'EXPIRED_PRODUCT',
            message: `Medicine expiry date must be in the future. Received expired date "${expiryStr}"`,
          });
        }
      }

      // PRD §8.2: Purchase price (> 0) and optional MRP sanity (MRP >= purchase price)
      const price = this._parsePrice(priceStr);
      if (isNaN(price) || price <= 0) {
        validationErrors.push({
          field: 'price',
          value: priceStr,
          errorCode: 'INVALID_PRICE',
          message: priceStr
            ? `Expected a positive number (> 0), received "${priceStr}"`
            : 'Price is empty or invalid',
        });
      } else {
        const rawMrp =
          rawRow.mrp !== undefined && rawRow.mrp !== null ? this._parsePrice(rawRow.mrp) : null;
        if (rawMrp !== null && !isNaN(rawMrp)) {
          if (rawMrp < price) {
            validationErrors.push({
              field: 'mrp',
              value: String(rawRow.mrp),
              errorCode: 'INVALID_MRP',
              message: `MRP (${rawMrp}) cannot be less than purchase price (${price})`,
            });
          }
        } else {
          const pricingError = validatePricing({
            purchasePrice: price,
            sellingPrice: price * 1.2,
            mrp: price * 1.2,
          });
          if (pricingError) {
            validationErrors.push({
              field: 'price',
              value: priceStr,
              errorCode: 'INVALID_PRICE',
              message: pricingError,
            });
          }
        }
      }

      if (rawBarcode) {
        analysis.validBarcodes++;
        if (barcodeOptions.validate) {
          const isValidFormat = /^[a-zA-Z0-9._-]{4,30}$/.test(rawBarcode);
          if (!isValidFormat) {
            validationWarnings.push(
              `Barcode "${rawBarcode}" has unusual format — importing anyway`,
            );
          }
        }
      } else if (barcodeOptions.autoGen) {
        analysis.autoGenBarcodes++;
      }

      if (validationErrors.length > 0) {
        for (const err of validationErrors) {
          analysis.errors.push({
            row: rowNum,
            name: name || 'Unknown',
            reason: err.message,
            field: err.field,
            value: err.value,
            errorCode: err.errorCode,
            message: err.message,
          });
        }
        continue;
      }

      // PRD §3.1: Identity Precedence: Priority 1 (Barcode), Priority 2 (Formulation Composite / Name)
      let matchedMedicine = null;
      let isBarcodeCollision = false;
      const normName = name.toLowerCase().trim();
      const normBarcode = barcode ? barcode.trim() : '';

      if (normBarcode && medicineMapByBarcode.has(normBarcode)) {
        matchedMedicine = medicineMapByBarcode.get(normBarcode);
        if (matchedMedicine.name.toLowerCase().trim() !== normName) {
          isBarcodeCollision = true;
        }
      } else {
        const compositeKey = `${normName}::${strength.toLowerCase().trim()}::${dosageForm.toLowerCase().trim()}`;
        if (medicineMapByComposite.has(compositeKey)) {
          matchedMedicine = medicineMapByComposite.get(compositeKey);
        } else if (medicineMapByName.has(normName)) {
          matchedMedicine = medicineMapByName.get(normName);
        }
      }

      preValidatedRows.push({
        rowNum,
        name,
        qty,
        expiryDate,
        price,
        batch: batch || '',
        rawBatch: batch,
        barcode:
          barcode ||
          (barcodeOptions.autoGen
            ? `BC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
            : null),
        matchedMedicine,
        isBarcodeCollision,
        category,
        manufacturer,
        genericName,
        strength,
        dosageForm,
        schedule,
        hsnCode,
        gstPercentage,
        isExpired,
        warnings: validationWarnings,
      });
    }

    const matchedMedicineIds = Array.from(
      new Set(
        preValidatedRows.filter((row) => row.matchedMedicine).map((row) => row.matchedMedicine.id),
      ),
    );

    // Fetch existing batches for all matched medicines to perform Priority 3 Batch-Level Resolution
    const existingBatchesList =
      matchedMedicineIds.length > 0
        ? await prisma.inventoryBatch.findMany({
            where: {
              tenantId,
              ...(branchId ? { branchId } : {}),
              medicineId: { in: matchedMedicineIds },
              deletedAt: null,
            },
            select: {
              id: true,
              branchId: true,
              medicineId: true,
              batchNumber: true,
              quantity: true,
              availableQuantity: true,
              purchasePrice: true,
              sellingPrice: true,
              mrp: true,
              expiryDate: true,
              status: true,
              isArchived: true,
              archiveReason: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    const batchLookupMap = new Map();
    const latestBatchByMedId = new Map();
    for (const b of existingBatchesList) {
      if (b.batchNumber) {
        const normBatch = b.batchNumber.toLowerCase().trim();
        const bBranch = b.branchId || branchId || 'default';
        const key = `${bBranch}:${b.medicineId}:${normBatch}`;
        if (!batchLookupMap.has(key)) {
          batchLookupMap.set(key, b);
        }
        if (bBranch !== 'default' && !batchLookupMap.has(`default:${b.medicineId}:${normBatch}`)) {
          batchLookupMap.set(`default:${b.medicineId}:${normBatch}`, b);
        }
      }
      if (!latestBatchByMedId.has(b.medicineId)) {
        latestBatchByMedId.set(b.medicineId, b);
      }
    }

    const validatedRows = [];
    for (const row of preValidatedRows) {
      const explicitDecision = this._getDecisionAction(duplicateDecisions, row.rowNum);
      const isMergeOrOverwrite =
        duplicateStrategy && ['merge', 'overwrite'].includes(duplicateStrategy.toLowerCase());
      let isDuplicate = Boolean(row.isDuplicate) || Boolean(explicitDecision);
      let isConflict = false;
      let conflictType = null;
      let matchType = 'NONE';
      let diffDesc = '';
      const matchedMedicine = row.matchedMedicine;

      if (matchedMedicine) {
        analysis.existingMedicines++;
        if (isProcessExisting) {
          analysis.willProcess++;
        } else {
          analysis.willSkip++;
        }

        if (!isProcessExisting) {
          // PRD: When processExistingMedicines is disabled, existing medicines are skipped
          // without raising duplicate conflicts or modifying existing records
          isDuplicate = false;
        } else {
          const bBranch = branchId || 'default';
          const normBatchNo = (row.batch || '').toLowerCase().trim();
          let existingBatch = normBatchNo
            ? batchLookupMap.get(`${bBranch}:${matchedMedicine.id}:${normBatchNo}`)
            : null;
          if (!existingBatch && normBatchNo && bBranch !== 'default') {
            existingBatch = batchLookupMap.get(`default:${matchedMedicine.id}:${normBatchNo}`);
          }

          // PRD §24 & §27: If batch exists, or if duplicate decision is set, or if strategy is Merge/Overwrite
          if (existingBatch || isDuplicate || isMergeOrOverwrite) {
            isDuplicate = true;
            analysis.duplicates++;

            const existingQty = existingBatch
              ? Number(existingBatch.quantity || existingBatch.availableQuantity || 0)
              : 0;
            const existingPrice = existingBatch ? Number(existingBatch.purchasePrice || 0) : 0;
            const existingMrp = existingBatch ? Number(existingBatch.mrp || 0) : 0;
            const existingExpiryStr =
              existingBatch && existingBatch.expiryDate
                ? typeof existingBatch.expiryDate.toISOString === 'function'
                  ? existingBatch.expiryDate.toISOString().split('T')[0]
                  : String(existingBatch.expiryDate).split('T')[0]
                : null;
            const importedExpiryStr = row.expiryDate
              ? typeof row.expiryDate.toISOString === 'function'
                ? row.expiryDate.toISOString().split('T')[0]
                : String(row.expiryDate).split('T')[0]
              : null;

            const diffDetails = {
              quantity: { existing: existingQty, imported: row.qty },
              expiry: { existing: existingExpiryStr, imported: importedExpiryStr },
              purchasePrice: { existing: existingPrice, imported: row.price },
              mrp: { existing: existingMrp, imported: row.price * 1.2 },
            };

            if (!existingBatch) {
              matchType = 'NEW_BATCH';
              diffDesc = `New batch "${row.batch || 'Auto-generated'}" for existing medicine "${matchedMedicine.name}"`;
            } else if (row.isBarcodeCollision) {
              isConflict = true;
              conflictType = 'BARCODE_COLLISION';
              matchType = 'BARCODE_COLLISION';
              analysis.conflicts++;
              diffDesc = `Barcode ${row.barcode} matches existing medicine "${matchedMedicine.name}" in system`;
            } else {
              const priceDiff = Math.abs(row.price - existingPrice) > 0.01;
              const expiryDiff =
                importedExpiryStr && existingExpiryStr && importedExpiryStr !== existingExpiryStr;

              if (priceDiff || expiryDiff) {
                isConflict = true;
                conflictType = priceDiff ? 'PRICE_MISMATCH' : 'EXPIRY_MISMATCH';
                matchType = 'DIFFERENCE';
                analysis.conflicts++;
                diffDesc = priceDiff
                  ? `Unit price mismatch (Imported: INR ${row.price} vs System: INR ${existingPrice})`
                  : `Expiry date mismatch (Imported: ${importedExpiryStr} vs System: ${existingExpiryStr})`;
              } else {
                matchType = 'EXACT';
                diffDesc = 'None (Details match)';
              }
            }

            analysis.rows.push({
              row: row.rowNum,
              name: row.name,
              match: matchedMedicine.name,
              matchType,
              type: matchType,
              severity: row.isBarcodeCollision ? 'danger' : isConflict ? 'warning' : 'info',
              diff: diffDesc,
              diffDetails,
              conflict: isConflict,
              conflictType,
              existing: {
                id: matchedMedicine.id,
                name: matchedMedicine.name,
                barcode: matchedMedicine.barcode || null,
                batch: existingBatch ? existingBatch.batchNumber : null,
                quantity: existingQty,
                expiry: existingExpiryStr,
                purchasePrice: existingPrice,
                mrp: existingMrp,
              },
              imported: {
                name: row.name,
                batch: row.batch || null,
                quantity: row.qty,
                expiry: importedExpiryStr,
                purchasePrice: row.price,
                mrp: row.price * 1.2,
                barcode: row.barcode || null,
              },
            });
          } else {
            // PRD §3.1 & TC-IMP-07: New Batch for Existing Medicine
            // isDuplicate remains false; counted under new
            analysis.new++;
          }
        }
      } else {
        if (importType === 'New Medicines') {
          analysis.new++;
        }
      }

      analysis.readyCount++;

      validatedRows.push({
        ...row,
        isDuplicate,
        isConflict,
        isSkippedDueToExisting: Boolean(matchedMedicine && !isProcessExisting),
      });
    }

    if (isDryRun) {
      return {
        success: true,
        dryRun: true,
        summary: {
          total: medicines.length,
          new: analysis.new,
          duplicates: analysis.duplicates,
          conflicts: analysis.conflicts,
          existingMedicines: analysis.existingMedicines,
          willProcess: analysis.willProcess,
          willSkip: analysis.willSkip,
          processExistingMedicines: isProcessExisting,
          errors: analysis.errors.length,
          readyCount: medicines.length - analysis.errors.length,
          validBarcodes: analysis.validBarcodes,
          autoGenBarcodes: analysis.autoGenBarcodes,
          rows: analysis.rows,
        },
        rows: analysis.rows,
        errors: analysis.errors,
      };
    }

    // --- COMMIT PHASE ---

    // PRD §4.4 & TC-IMP-04: Validate Ask Me resolution completeness
    if (duplicateStrategy && duplicateStrategy.toLowerCase() === 'ask me') {
      const unresolvedRows = validatedRows
        .filter((r) => r.isConflict && !this._getDecisionAction(duplicateDecisions, r.rowNum))
        .map((r) => r.rowNum);
      if (unresolvedRows.length > 0) {
        const err = new Error(
          `Unresolved duplicate conflicts remaining on row(s): ${unresolvedRows.join(', ')}. Please resolve each duplicate conflict before importing.`,
        );
        err.errorCode = 'UNRESOLVED_DUPLICATES_REMAINING';
        throw err;
      }
    }

    let createdCount = 0;
    let overwrittenCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    const uniqueCategories = new Set();
    const uniqueManufacturers = new Set();
    for (const row of validatedRows) {
      if (row.category) uniqueCategories.add(row.category.trim());
      if (row.manufacturer) uniqueManufacturers.add(row.manufacturer.trim());
    }

    const categoryMap = new Map();
    if (uniqueCategories.size > 0) {
      const existingCats = await prisma.medicineCategory.findMany({
        where: {
          tenantId,
          name: { in: Array.from(uniqueCategories), mode: 'insensitive' },
          deletedAt: null,
        },
      });
      for (const cat of existingCats) {
        categoryMap.set(cat.name.toLowerCase(), cat.id);
      }
      const missingCats = Array.from(uniqueCategories).filter(
        (c) => !categoryMap.has(c.toLowerCase()),
      );
      if (missingCats.length > 0) {
        await prisma.medicineCategory.createMany({
          data: missingCats.map((c) => ({ tenantId, name: c })),
          skipDuplicates: true,
        });
        const newlyCreatedCats = await prisma.medicineCategory.findMany({
          where: { tenantId, name: { in: missingCats, mode: 'insensitive' }, deletedAt: null },
        });
        for (const cat of newlyCreatedCats) {
          categoryMap.set(cat.name.toLowerCase(), cat.id);
        }
      }
    }

    const manufacturerMap = new Map();
    if (uniqueManufacturers.size > 0) {
      const existingMfrs = await prisma.manufacturer.findMany({
        where: {
          tenantId,
          name: { in: Array.from(uniqueManufacturers), mode: 'insensitive' },
          deletedAt: null,
        },
      });
      for (const mfr of existingMfrs) {
        manufacturerMap.set(mfr.name.toLowerCase(), mfr.id);
      }
      const missingMfrs = Array.from(uniqueManufacturers).filter(
        (m) => !manufacturerMap.has(m.toLowerCase()),
      );
      if (missingMfrs.length > 0) {
        await prisma.manufacturer.createMany({
          data: missingMfrs.map((m) => ({ tenantId, name: m })),
          skipDuplicates: true,
        });
        const newlyCreatedMfrs = await prisma.manufacturer.findMany({
          where: { tenantId, name: { in: missingMfrs, mode: 'insensitive' }, deletedAt: null },
        });
        for (const mfr of newlyCreatedMfrs) {
          manufacturerMap.set(mfr.name.toLowerCase(), mfr.id);
        }
      }
    }

    const commitBatchMap = new Map();
    for (const [key, batch] of batchLookupMap.entries()) {
      commitBatchMap.set(key, { id: batch.id, isNew: false, batch });
    }

    const newMedicines = [];
    const newBatches = [];
    const newMovements = [];
    const inventoryUpdates = [];
    const medicineUpdates = [];
    const batchQuantityUpdates = [];
    const defaultExpiry = new Date(new Date().setFullYear(new Date().getFullYear() + 2));

    for (const row of validatedRows) {
      let medicineId = null;
      let isDuplicateResolution = false;
      let duplicateAction = null;

      const normName = row.name.toLowerCase().trim();
      const normBarcode = row.barcode ? row.barcode.trim() : '';

      let currentMatch =
        (normBarcode && medicineMapByBarcode.get(normBarcode)) ||
        medicineMapByName.get(normName) ||
        null;

      if (currentMatch) {
        medicineId = currentMatch.id;

        if (!isProcessExisting) {
          skippedCount++;
          continue;
        }

        if (row.isDuplicate) {
          const action = (
            this._getDecisionAction(duplicateDecisions, row.rowNum) || duplicateStrategy
          ).toLowerCase();

          // PRD §4.1: Strategy Skip - 0 master updates, 0 batch updates, 0 stock aggregate changes
          if (action === 'skip') {
            skippedCount++;
            continue;
          }

          // PRD §4.2: Strategy Overwrite / §4.3 Strategy Merge
          if (action === 'overwrite' || action === 'merge') {
            isDuplicateResolution = true;
            duplicateAction = action;

            if (action === 'overwrite') overwrittenCount++;
            if (action === 'merge') mergedCount++;

            // Master Catalog Updates (Immutable under Stock Entry Only)
            if (importType !== 'Stock Entry Only') {
              const updatePayload = {};
              if (row.barcode && (barcodeOptions.overwrite || !currentMatch.barcode)) {
                updatePayload.barcode = row.barcode;
                currentMatch.barcode = row.barcode;
                medicineMapByBarcode.set(row.barcode.trim(), currentMatch);
              }
              if (row.category && (action === 'overwrite' || !currentMatch.categoryId)) {
                const resolvedCatId = categoryMap.get(row.category.trim().toLowerCase());
                if (resolvedCatId) {
                  updatePayload.categoryId = resolvedCatId;
                  currentMatch.categoryId = resolvedCatId;
                }
              }
              if (row.manufacturer && (action === 'overwrite' || !currentMatch.manufacturerId)) {
                const resolvedMfrId = manufacturerMap.get(row.manufacturer.trim().toLowerCase());
                if (resolvedMfrId) {
                  updatePayload.manufacturerId = resolvedMfrId;
                  currentMatch.manufacturerId = resolvedMfrId;
                }
              }
              if (row.schedule && (action === 'overwrite' || !currentMatch.scheduleType)) {
                updatePayload.scheduleType = row.schedule;
                currentMatch.scheduleType = row.schedule;
              }
              if (row.genericName && (action === 'overwrite' || !currentMatch.genericName)) {
                updatePayload.genericName = row.genericName;
                currentMatch.genericName = row.genericName;
              }
              if (row.strength && (action === 'overwrite' || !currentMatch.strength)) {
                updatePayload.strength = row.strength;
                currentMatch.strength = row.strength;
              }
              if (row.dosageForm && (action === 'overwrite' || !currentMatch.dosageForm)) {
                updatePayload.dosageForm = row.dosageForm;
                currentMatch.dosageForm = row.dosageForm;
              }
              if (row.hsnCode && (action === 'overwrite' || !currentMatch.hsnCode)) {
                updatePayload.hsnCode = row.hsnCode;
                currentMatch.hsnCode = row.hsnCode;
              }
              if (
                row.gstPercentage !== undefined &&
                (action === 'overwrite' ||
                  currentMatch.gstPercentage === null ||
                  currentMatch.gstPercentage === undefined)
              ) {
                updatePayload.gstPercentage = row.gstPercentage;
                currentMatch.gstPercentage = row.gstPercentage;
              }
              if (Object.keys(updatePayload).length > 0) {
                medicineUpdates.push({ id: medicineId, data: updatePayload });
              }
            }

            // Batch Updates for Overwrite / Merge
            const parsedQty = parseInt(row.qty, 10);
            let finalBatchNo = row.batch
              ? String(row.batch).trim()
              : `IMP-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
            const bBranch = branchId || 'default';
            const normFinalBatch = finalBatchNo.toLowerCase().trim();
            let batchKey = `${bBranch}:${medicineId}:${normFinalBatch}`;
            let existingBatchEntry = commitBatchMap.get(batchKey);
            if (!existingBatchEntry && bBranch !== 'default') {
              existingBatchEntry = commitBatchMap.get(`default:${medicineId}:${normFinalBatch}`);
            }

            if (existingBatchEntry) {
              const existingBatch = existingBatchEntry.batch;
              const isArchived = Boolean(
                existingBatch?.isArchived || existingBatch?.status === 'ARCHIVED',
              );
              const archiveReason = existingBatch?.archiveReason;

              // Rules 2, 3, 4:
              // If archived for reasons other than CLEAR_INVENTORY (e.g. Expired Cleanup):
              if (isArchived && archiveReason !== 'CLEAR_INVENTORY') {
                const isRowExpired = row.expiryDate
                  ? new Date(row.expiryDate) <= new Date()
                  : false;
                if (isRowExpired) {
                  // Do not resurrect expired cleanup historical stock
                  continue;
                }
                // Valid incoming batch reusing an expired cleanup batch number:
                // Create as new versioned batch to satisfy unique constraint without reviving historical stock
                finalBatchNo = `${finalBatchNo}-V2`;
                batchKey = `${bBranch}:${medicineId}:${finalBatchNo.toLowerCase().trim()}`;
                // Fall through to create new batch below
              } else {
                const targetBatchId = existingBatchEntry.id;
                const isStockEntryOnly = importType === 'Stock Entry Only';
                const mode = isStockEntryOnly
                  ? 'INCREMENT'
                  : action === 'overwrite'
                    ? 'SET'
                    : 'INCREMENT';

                const batchUpdate = {
                  batchId: targetBatchId,
                  medicineId,
                  mode,
                  qty: parsedQty,
                  ...(isArchived && archiveReason === 'CLEAR_INVENTORY'
                    ? { reactivate: true }
                    : {}),
                };

                if (action === 'overwrite') {
                  batchUpdate.purchasePrice = row.price;
                  batchUpdate.sellingPrice = row.price * 1.2;
                  batchUpdate.mrp = row.price * 1.2;
                  if (row.expiryDate) batchUpdate.expiryDate = row.expiryDate;
                }

                batchQuantityUpdates.push(batchUpdate);

                newMovements.push({
                  id: crypto.randomUUID(),
                  batchId: targetBatchId,
                  tenantId,
                  branchId,
                  medicineId,
                  movementType: 'STOCK_IN',
                  quantity: parsedQty,
                  referenceType: 'BULK_IMPORT',
                  performedBy: userId,
                  notes: `Duplicate resolved via ${action.toUpperCase()}`,
                });

                inventoryUpdates.push({ medicineId, qty: parsedQty });
                continue;
              }
            }
            // PRD §24 & §27: If existing batch was NOT found for this medicine,
            // do not continue; fall through to create the new batch in newBatches below.
          }
        }
      } else {
        // Unmatched medicine handling
        if (importType === 'Update Existing') {
          analysis.errors.push({
            row: row.rowNum,
            name: row.name || 'Unknown',
            field: 'name',
            value: row.name,
            errorCode: 'RECORD_NOT_FOUND',
            message: `Cannot update medicine "${row.name}" because it does not exist in system.`,
          });
          continue;
        }
        if (importType === 'Stock Entry Only') {
          analysis.errors.push({
            row: row.rowNum,
            name: row.name || 'Unknown',
            field: 'name',
            value: row.name,
            errorCode: 'MEDICINE_NOT_FOUND',
            message: `Cannot add stock for medicine "${row.name}" because it does not exist in catalog.`,
          });
          continue;
        }

        // New Medicine creation
        let categoryId = row.category
          ? categoryMap.get(row.category.trim().toLowerCase()) || null
          : null;

        let manufacturerId = row.manufacturer
          ? manufacturerMap.get(row.manufacturer.trim().toLowerCase()) || null
          : null;

        medicineId = crypto.randomUUID();
        const prescriptionRequired = row.schedule === 'H' || row.schedule === 'H1';

        newMedicines.push({
          id: medicineId,
          tenantId,
          userId,
          name: row.name,
          genericName: row.genericName || null,
          barcode: row.barcode,
          hsnCode: row.hsnCode || null,
          dosageForm: row.dosageForm || null,
          packagingType: mapDosageFormToPackaging(row.dosageForm),
          strength: row.strength || null,
          scheduleType: row.schedule || 'OTC',
          sku: `SKU-${crypto.randomUUID()}`,
          gstPercentage: parseFloat(row.gstPercentage) || 0,
          reorderLevel: 10,
          status: 'ACTIVE',
          isActive: true,
          requiresPrescription: prescriptionRequired,
          prescriptionRequired,
          categoryId: categoryId || null,
          manufacturerId: manufacturerId || null,
        });

        const cachedMed = {
          id: medicineId,
          name: row.name,
          barcode: row.barcode,
          categoryId,
          manufacturerId,
          genericName: row.genericName,
          strength: row.strength,
          dosageForm: row.dosageForm,
          scheduleType: row.schedule,
        };
        medicineMapByName.set(normName, cachedMed);
        if (row.barcode) {
          medicineMapByBarcode.set(row.barcode.trim(), cachedMed);
        }
      }

      // Handle stock creation for New Medicines or New Batches on Existing Medicines
      const parsedQty = parseInt(row.qty, 10);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        const parsedPrice = parseFloat(row.price) || 0;
        let finalBatchNo = row.batch
          ? String(row.batch).trim()
          : `IMP-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
        const normFinalBatch = finalBatchNo.toLowerCase().trim();
        const bBranch = branchId || 'default';
        let batchKey = `${bBranch}:${medicineId}:${normFinalBatch}`;
        let existingBatchEntry = commitBatchMap.get(batchKey);
        if (!existingBatchEntry && bBranch !== 'default') {
          existingBatchEntry = commitBatchMap.get(`default:${medicineId}:${normFinalBatch}`);
        }

        let targetBatchId = null;

        if (existingBatchEntry) {
          const existingBatch = existingBatchEntry.batch;
          const isArchived = Boolean(
            existingBatch?.isArchived || existingBatch?.status === 'ARCHIVED',
          );
          const archiveReason = existingBatch?.archiveReason;

          if (existingBatchEntry.isNew) {
            newBatches[existingBatchEntry.index].quantity += parsedQty;
            newBatches[existingBatchEntry.index].receivedQuantity += parsedQty;
            newBatches[existingBatchEntry.index].availableQuantity += parsedQty;
            targetBatchId = existingBatchEntry.id;
          } else if (isArchived && archiveReason !== 'CLEAR_INVENTORY') {
            // Rule 4: Never resurrect Expired Cleanup historical stock
            const isRowExpired = row.expiryDate ? new Date(row.expiryDate) <= new Date() : false;
            if (isRowExpired) {
              logger.warn(
                { medicineId, batchNo: finalBatchNo, expiryDate: row.expiryDate },
                '[Bulk-Import] Skipping re-import of expired batch matching historical Expired Cleanup record',
              );
              continue;
            }
            const oldBatchKey = batchKey;
            finalBatchNo = `${finalBatchNo}-V2`;
            batchKey = `${bBranch}:${medicineId}:${finalBatchNo.toLowerCase().trim()}`;
            targetBatchId = crypto.randomUUID();
            newBatches.push({
              id: targetBatchId,
              tenantId,
              medicineId,
              branchId,
              batchNumber: finalBatchNo,
              quantity: parsedQty,
              receivedQuantity: parsedQty,
              availableQuantity: parsedQty,
              expiryDate: row.expiryDate || defaultExpiry,
              purchasePrice: parsedPrice,
              sellingPrice: parsedPrice * 1.2,
              mrp: parsedPrice * 1.2,
              status: 'ACTIVE',
              supplierId: resolvedSupplierId,
            });
            const newEntry = {
              id: targetBatchId,
              isNew: true,
              index: newBatches.length - 1,
            };
            commitBatchMap.set(oldBatchKey, newEntry);
            commitBatchMap.set(batchKey, newEntry);
          } else {
            targetBatchId = existingBatchEntry.id;
            batchQuantityUpdates.push({
              batchId: targetBatchId,
              qty: parsedQty,
              medicineId,
              ...(isArchived && archiveReason === 'CLEAR_INVENTORY' ? { reactivate: true } : {}),
            });
          }
        } else {
          targetBatchId = crypto.randomUUID();
          newBatches.push({
            id: targetBatchId,
            tenantId,
            medicineId,
            branchId,
            batchNumber: finalBatchNo,
            quantity: parsedQty,
            receivedQuantity: parsedQty,
            availableQuantity: parsedQty,
            expiryDate: row.expiryDate || defaultExpiry,
            purchasePrice: parsedPrice,
            sellingPrice: parsedPrice * 1.2,
            mrp: parsedPrice * 1.2,
            status: 'ACTIVE',
            supplierId: resolvedSupplierId,
          });
          commitBatchMap.set(batchKey, {
            id: targetBatchId,
            isNew: true,
            index: newBatches.length - 1,
          });
        }

        newMovements.push({
          id: crypto.randomUUID(),
          batchId: targetBatchId,
          tenantId,
          branchId,
          medicineId,
          movementType: 'STOCK_IN',
          quantity: parsedQty,
          referenceType: 'BULK_IMPORT',
          performedBy: userId,
          notes: isDuplicateResolution
            ? `Duplicate resolved via ${duplicateAction.toUpperCase()} (new batch created)`
            : `Bulk imported from ${supplierName !== 'None' ? supplierName : 'spreadsheet'}`,
        });

        inventoryUpdates.push({ medicineId, qty: parsedQty });
        if (!isDuplicateResolution) {
          createdCount++;
        }
      }
    }

    try {
      const { default: sharedImportEngine } = await import('./shared-import.engine.js');
      await sharedImportEngine.commitChunks({
        tenantId,
        branchId,
        userId,
        jobId: jobId || `bulk-api-${Date.now()}`,
        newMedicines,
        newBatches,
        newMovements,
        inventoryUpdates,
        batchQuantityUpdates,
        medicineUpdates,
        progressTotal: medicines.length,
        onProgress: jobId
          ? async ({ processed, total }) => {
              const percentage =
                total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;

              await updateBulkProgress(jobId, {
                processed,
                total,
                percentage,
                status: 'processing',
              });
            }
          : undefined,
      });
    } catch (err) {
      logger.error({ err: err.message, stack: err.stack }, 'Bulk import transaction failed');
      throw new Error(`Import failed: ${err.message}`);
    }

    // Mathematical Summary Invariants (PRD §7.3):
    // total = imported + skipped + failed
    // imported = created + updated
    // updated = overwritten + merged
    const totalProcessed = medicines.length;
    const totalUpdated = overwrittenCount + mergedCount;
    const totalImported = createdCount + totalUpdated;
    const totalSkipped = skippedCount;
    const totalFailed = analysis.errors.length;
    const existingMedicinesCount = validatedRows.filter((r) => r.matchedMedicine).length;

    const commitSummary = {
      total: totalProcessed,
      imported: totalImported,
      created: createdCount,
      updated: totalUpdated,
      skipped: totalSkipped,
      overwritten: overwrittenCount,
      merged: mergedCount,
      failed: totalFailed,
      duplicates: totalUpdated,
      existingMedicines: existingMedicinesCount,
      processExistingMedicines: isProcessExisting,
      totalRows: totalProcessed,
      importedCount: totalImported,
      skippedCount: totalSkipped,
      newMedicinesCount: newMedicines.length,
      newBatchesCount: newBatches.length,
      warnings: 0,
    };

    const importJob = await prisma.importJob.create({
      data: {
        tenantId,
        importType: 'BULK_MEDICINES',
        importStatus: 'COMPLETED',
        uploadedBy: userId,
        fileName: payload.fileName || 'bulk_import.csv',
        processedAt: new Date(),
        extractedData: {
          strategy: duplicateStrategy,
          processExistingMedicines: isProcessExisting,
          supplier: supplierName !== 'None' ? supplierName : 'General / CSV',
          summary: commitSummary,
        },
      },
    });

    try {
      await auditService.log({
        tenantId,
        userId,
        action: 'BULK_IMPORT_COMPLETED',
        target: importJob.id,
        type: 'INVENTORY',
        metadata: commitSummary,
      });
    } catch (auditErr) {
      logger.warn({ err: auditErr }, 'Audit log failed (non-blocking)');
    }

    return {
      success: true,
      dryRun: false,
      message:
        analysis.errors.length > 0
          ? 'Bulk import completed with validation errors.'
          : 'Bulk import completed successfully.',
      summary: commitSummary,
      audit: {
        importId: importJob.id,
        committedAt: importJob.createdAt || new Date(),
        committedBy: userId,
      },
      errors: analysis.errors,
    };
  }

  _getDecisionAction(decisions, rowNum) {
    if (!decisions || typeof decisions !== 'object') return null;
    const val = decisions[rowNum] || decisions[String(rowNum)];
    if (!val) return null;
    if (typeof val === 'string') return val.toUpperCase().trim();
    if (typeof val === 'object' && val.action) return String(val.action).toUpperCase().trim();
    return null;
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

  parseExpiryDate(dateStr) {
    if (!dateStr) return null;
    const trimmed = String(dateStr).trim();

    const numVal = Number(trimmed);
    if (!isNaN(numVal) && numVal > 10000 && numVal < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numVal * 86400000);
      if (!isNaN(date.getTime())) return date;
    }

    let date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;

    const parts = trimmed.split(/[-/.\s]/);

    if (parts.length === 2) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      if (p0 > 1000 && p1 >= 1 && p1 <= 12) {
        return new Date(p0, p1 - 1, 1);
      }
      if (p1 > 1000 && p0 >= 1 && p0 <= 12) {
        return new Date(p1, p0 - 1, 1);
      }
    }

    if (parts.length === 3) {
      const a = parseInt(parts[0], 10);
      const b = parseInt(parts[1], 10);
      const c = parseInt(parts[2], 10);

      if (a <= 31 && b <= 12 && c > 1000) {
        date = new Date(c, b - 1, a);
        if (!isNaN(date.getTime())) return date;
      }

      if (a <= 12 && b <= 31 && c > 1000) {
        date = new Date(c, a - 1, b);
        if (!isNaN(date.getTime())) return date;
      }
      if (a > 1000 && b <= 12 && c <= 31) {
        date = new Date(a, b - 1, c);
        if (!isNaN(date.getTime())) return date;
      }
    }

    return null;
  }

  _normalizeSchedule(val) {
    if (!val) return 'OTC';
    const clean = String(val).trim().toUpperCase();
    if (clean === 'OTC' || clean.includes('NON') || clean === 'NON-SCHEDULED') return 'OTC';
    if (clean === 'G' || clean === 'SCHEDULE G' || clean === 'SCHEDULE_G') return 'G';
    if (clean === 'H' || clean === 'SCHEDULE H' || clean === 'SCHEDULE_H') return 'H';
    if (clean === 'H1' || clean === 'SCHEDULE H1' || clean === 'SCHEDULE_H1') return 'H1';
    if (clean === 'X' || clean === 'SCHEDULE X' || clean === 'SCHEDULE_X') return 'X';
    if (clean === 'OTHER' || clean === 'OTHER_SPECIAL' || clean.includes('SPECIAL'))
      return 'OTHER_SPECIAL';
    return clean;
  }
}

export default new BulkImportService();
