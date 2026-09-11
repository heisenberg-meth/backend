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
  async getInventoryState(tenantId, branchId = null) {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const branchFilter =
      branchId && branchId !== 'null' && branchId !== 'undefined' ? { branchId } : {};

    let existingMedicineCount = 0;

    // PRD §6: Check actual pharmacy inventory/batches, not master medicine catalog
    if (typeof prisma.inventoryBatch?.count === 'function') {
      existingMedicineCount = await prisma.inventoryBatch.count({
        where: {
          tenantId,
          deletedAt: null,
          isArchived: false,
          status: { not: 'ARCHIVED' },
          ...branchFilter,
        },
      });
    } else if (typeof prisma.inventoryBatch?.findMany === 'function') {
      const sample = await prisma.inventoryBatch.findMany({
        where: {
          tenantId,
          deletedAt: null,
          isArchived: false,
          status: { not: 'ARCHIVED' },
          ...branchFilter,
        },
        take: 1,
        select: { id: true },
      });
      if (sample && sample.length > 0) {
        existingMedicineCount = sample.length;
      }
    } else if (typeof prisma.inventory?.count === 'function') {
      existingMedicineCount = await prisma.inventory.count({
        where: {
          tenantId,
          ...branchFilter,
        },
      });
    } else if (typeof prisma.medicine?.count === 'function') {
      // Fallback only if inventory models are not available
      existingMedicineCount = await prisma.medicine.count({
        where: {
          tenantId,
          deletedAt: null,
        },
      });
    }

    const inventoryState = existingMedicineCount === 0 ? 'EMPTY' : 'EXISTING';
    const requiresDuplicateStrategy = existingMedicineCount > 0;

    return {
      success: true,
      inventoryState,
      existingMedicineCount,
      requiresDuplicateStrategy,
      recommendedStrategy: inventoryState === 'EMPTY' ? 'DIRECT_IMPORT' : 'SKIP',
    };
  }

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

    const stateInfo = await this.getInventoryState(tenantId, branchId);
    const {
      inventoryState,
      existingMedicineCount,
      requiresDuplicateStrategy,
      recommendedStrategy,
    } = stateInfo;

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
      inventoryState,
      existingMedicineCount,
      requiresDuplicateStrategy,
      recommendedStrategy,
    };

    const preValidatedRows = [];
    const namesToLookup = new Set();
    const barcodesToLookup = new Set();
    const seenInFile = new Map();

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

    let currentInventoryState = inventoryState;
    let currentExistingCount = existingMedicineCount;
    let currentRequiresDup = requiresDuplicateStrategy;
    let currentRecommendedStrategy = recommendedStrategy;

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

      // PRD §52: Intra-file duplicate detection (same medicine name + batch in uploaded file)
      if (name && batch) {
        const fileKey = `${name.toLowerCase()}::${batch.toLowerCase()}`;
        if (seenInFile.has(fileKey)) {
          const firstSeenRow = seenInFile.get(fileKey);
          validationErrors.push({
            field: 'batch',
            value: rawRow.batch,
            code: 'INTERNAL_DUPLICATE',
            errorCode: 'INTERNAL_DUPLICATE',
            message: `Duplicate row in file: "${name}" with batch "${rawRow.batch}" was already defined on row ${firstSeenRow}`,
            action: 'Remove the duplicate row or assign a unique batch number.',
            category: 'Duplicate',
          });
        } else {
          seenInFile.set(fileKey, rowNum);
        }
      }

      // PRD Addendum §7: Medicine Name - required and min 2 non-whitespace characters
      if (!name || name.replace(/\s+/g, '').length < 2) {
        validationErrors.push({
          field: 'name',
          value: name,
          code: 'MISSING_MEDICINE_NAME',
          errorCode: 'MISSING_MEDICINE_NAME',
          message:
            'Medicine name is required and must contain at least 2 non-whitespace characters',
          action: 'Provide a valid medicine name with at least 2 characters.',
          category: 'Required',
        });
      }

      // PRD Addendum §3.1: Quantity validation - allow 0, reject negative, reject non-numeric/empty
      let qty = NaN;
      if (!qtyStr) {
        validationErrors.push({
          field: 'quantity',
          value: qtyStr,
          code: 'MISSING_QUANTITY',
          errorCode: 'MISSING_QUANTITY',
          message: 'Quantity is required',
          action: 'Specify quantity as 0 or a positive number.',
          category: 'Quantity',
        });
      } else {
        qty = this._parseQuantity(qtyStr);
        if (isNaN(qty)) {
          validationErrors.push({
            field: 'quantity',
            value: qtyStr,
            code: 'INVALID_QUANTITY',
            errorCode: 'INVALID_QUANTITY',
            message: 'Quantity must be a number',
            action: 'Enter a valid numeric quantity.',
            category: 'Quantity',
          });
        } else if (qty < 0) {
          validationErrors.push({
            field: 'quantity',
            value: qtyStr,
            code: 'INVALID_QUANTITY',
            errorCode: 'INVALID_QUANTITY',
            message: 'Quantity must be 0 or more',
            action: 'Change the quantity to 0 or a positive number.',
            category: 'Quantity',
          });
        }
      }

      // PRD Addendum §4 & §5: Expiry date validation - reject strictly before today, allow today
      let expiryDate = null;
      let isExpired = false;
      if (expiryStr) {
        expiryDate = this.parseExpiryDate(expiryStr);
        if (!expiryDate) {
          validationErrors.push({
            field: 'expiryDate',
            value: expiryStr,
            code: 'INVALID_EXPIRY_DATE',
            errorCode: 'INVALID_EXPIRY_DATE',
            message: `Invalid expiry date format: "${expiryStr}"`,
            action: 'Use YYYY-MM-DD or MM/YYYY date format.',
            category: 'Expiry',
          });
        } else {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          if (expiryDate < startOfToday) {
            isExpired = true;
            validationErrors.push({
              field: 'expiryDate',
              value: expiryStr,
              code: 'EXPIRED_DATE',
              errorCode: 'EXPIRED_DATE',
              message: 'Expiry date cannot be in the past',
              action: 'Update the expiry date to today or a future date.',
              category: 'Expiry',
            });
          }
        }
      }

      // PRD Addendum §7: Pricing validation - purchase price (> 0), MRP >= purchase price
      const price = this._parsePrice(priceStr);
      if (isNaN(price) || price <= 0) {
        validationErrors.push({
          field: 'price',
          value: priceStr,
          code: 'INVALID_PURCHASE_PRICE',
          errorCode: 'INVALID_PURCHASE_PRICE',
          message: priceStr
            ? `Purchase price must be greater than 0, received "${priceStr}"`
            : 'Purchase price is required and must be greater than 0',
          action: 'Enter a valid purchase price greater than 0.',
          category: 'Pricing',
        });
      } else {
        const rawMrp =
          rawRow.mrp !== undefined && rawRow.mrp !== null ? this._parsePrice(rawRow.mrp) : null;
        if (rawMrp !== null && !isNaN(rawMrp)) {
          if (rawMrp < price) {
            validationErrors.push({
              field: 'mrp',
              value: String(rawRow.mrp),
              code: 'MRP_BELOW_PURCHASE_PRICE',
              errorCode: 'MRP_BELOW_PURCHASE_PRICE',
              message: `MRP (${rawMrp}) cannot be less than purchase price (${price})`,
              action: 'Ensure MRP is greater than or equal to purchase price.',
              category: 'Pricing',
            });
          } else if (rawMrp <= 0) {
            validationErrors.push({
              field: 'mrp',
              value: String(rawRow.mrp),
              code: 'INVALID_MRP',
              errorCode: 'INVALID_MRP',
              message: 'MRP must be greater than 0',
              action: 'Enter a valid MRP greater than 0.',
              category: 'Pricing',
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
              code: 'INVALID_PURCHASE_PRICE',
              errorCode: 'INVALID_PURCHASE_PRICE',
              message: pricingError,
              action: 'Ensure price and margin values are valid.',
              category: 'Pricing',
            });
          }
        }

        const rawSelling =
          rawRow.sellingPrice !== undefined && rawRow.sellingPrice !== null
            ? this._parsePrice(rawRow.sellingPrice)
            : null;
        if (rawSelling !== null && !isNaN(rawSelling) && rawMrp !== null && !isNaN(rawMrp)) {
          if (rawSelling > rawMrp) {
            validationErrors.push({
              field: 'sellingPrice',
              value: String(rawRow.sellingPrice),
              code: 'SELLING_PRICE_ABOVE_MRP',
              errorCode: 'SELLING_PRICE_ABOVE_MRP',
              message: 'Selling price cannot exceed MRP',
              action: 'Set selling price to be less than or equal to MRP.',
              category: 'Pricing',
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

      // PRD Addendum §6 & §8: Multi-error collection per row
      if (validationErrors.length > 0) {
        const primaryError = validationErrors[0];
        const combinedMessage = validationErrors.map((e) => e.message).join('; ');
        analysis.errors.push({
          row: rowNum,
          rowNumber: rowNum,
          name: name || 'Unknown',
          medicineName: name || 'Unknown',
          batch: batch || '',
          batchNumber: batch || '',
          field: primaryError.field,
          value: primaryError.value,
          code: primaryError.code,
          errorCode: primaryError.errorCode,
          message: combinedMessage,
          reason: combinedMessage,
          action: primaryError.action,
          category: primaryError.category || 'Other',
          rawRow,
          errors: validationErrors.map((err) => ({
            field: err.field,
            code: err.code,
            errorCode: err.errorCode,
            message: err.message,
            value: err.value !== undefined ? String(err.value) : '',
            action: err.action || '',
            category: err.category || 'Other',
          })),
        });
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

      if (currentInventoryState === 'EMPTY') {
        // PRD §4, §5, §10, §33 AC-01, AC-02, AC-03:
        // FIRST IMPORT MODE: Inventory is empty. Duplicate handling is bypassed completely.
        // Even if the medicine exists in the catalog master, this is the first inventory import for this pharmacy.
        // Valid rows are directly imported into inventory (0 skipped, 0 duplicate conflicts).
        isDuplicate = false;
        analysis.new++;
      } else if (matchedMedicine) {
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
        isSkippedDueToExisting: Boolean(
          currentInventoryState !== 'EMPTY' && matchedMedicine && !isProcessExisting,
        ),
      });
    }

    if (isDryRun) {
      return {
        success: true,
        dryRun: true,
        importSessionId: jobId || `preview-${Date.now()}`,
        inventoryState: currentInventoryState,
        existingMedicineCount: currentExistingCount,
        requiresDuplicateStrategy: currentRequiresDup,
        recommendedStrategy: currentRecommendedStrategy,
        summary: {
          total: medicines.length,
          totalRows: medicines.length,
          validRows: medicines.length - analysis.errors.length,
          invalidRows: analysis.errors.length,
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
          inventoryState: currentInventoryState,
          existingMedicineCount: currentExistingCount,
          requiresDuplicateStrategy: currentRequiresDup,
          recommendedStrategy: currentRecommendedStrategy,
        },
        rows: analysis.rows,
        errors: analysis.errors,
        validationErrors: analysis.errors,
        failedRecords: analysis.errors,
      };
    }

    // --- COMMIT PHASE ---

    // PRD §4.4 & TC-IMP-04: Validate Ask Me resolution completeness for existing inventory
    if (
      currentInventoryState === 'EXISTING' &&
      duplicateStrategy &&
      duplicateStrategy.toLowerCase() === 'ask me'
    ) {
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

        if (currentInventoryState === 'EMPTY') {
          // PRD §4, §10, §33 AC-01, AC-02, AC-03:
          // In First Import Mode, reuse existing catalog medicine definition
          // and directly import the new batch into inventory. Never skip due to duplicate strategy or isProcessExisting!
        } else {
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
        }
      } else {
        // Unmatched medicine handling
        if (importType === 'Update Existing') {
          const errMsg = `Cannot update medicine "${row.name}" because it does not exist in system.`;
          analysis.errors.push({
            row: row.rowNum,
            rowNumber: row.rowNum,
            name: row.name || 'Unknown',
            medicineName: row.name || 'Unknown',
            batch: row.batch || '',
            batchNumber: row.batch || '',
            field: 'name',
            value: row.name,
            code: 'RECORD_NOT_FOUND',
            errorCode: 'RECORD_NOT_FOUND',
            message: errMsg,
            reason: errMsg,
            action: 'Ensure medicine exists in system or select "New Medicines" import type.',
            category: 'Other',
            rawRow: row,
            errors: [
              {
                field: 'name',
                code: 'RECORD_NOT_FOUND',
                errorCode: 'RECORD_NOT_FOUND',
                message: errMsg,
                value: row.name,
                action: 'Ensure medicine exists in system or select "New Medicines" import type.',
                category: 'Other',
              },
            ],
          });
          continue;
        }
        if (importType === 'Stock Entry Only') {
          const errMsg = `Cannot add stock for medicine "${row.name}" because it does not exist in catalog.`;
          analysis.errors.push({
            row: row.rowNum,
            rowNumber: row.rowNum,
            name: row.name || 'Unknown',
            medicineName: row.name || 'Unknown',
            batch: row.batch || '',
            batchNumber: row.batch || '',
            field: 'name',
            value: row.name,
            code: 'MEDICINE_NOT_FOUND',
            errorCode: 'MEDICINE_NOT_FOUND',
            message: errMsg,
            reason: errMsg,
            action: 'Add medicine to catalog first or select "New Medicines" import type.',
            category: 'Other',
            rawRow: row,
            errors: [
              {
                field: 'name',
                code: 'MEDICINE_NOT_FOUND',
                errorCode: 'MEDICINE_NOT_FOUND',
                message: errMsg,
                value: row.name,
                action: 'Add medicine to catalog first or select "New Medicines" import type.',
                category: 'Other',
              },
            ],
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

      // PRD Addendum §3.1: Handle stock creation for New Medicines or New Batches (allow qty 0 for out-of-stock SKUs)
      const parsedQty = parseInt(row.qty, 10);
      if (!isNaN(parsedQty) && parsedQty >= 0) {
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
      inventoryState: currentInventoryState,
      existingMedicineCount: currentExistingCount,
      requiresDuplicateStrategy: currentRequiresDup,
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
      status: analysis.errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
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
      validationErrors: analysis.errors,
      failedRecords: analysis.errors,
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
