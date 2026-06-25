import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import logger from '../../../shared/utils/logger.js';
import {
  mapDosageFormToPackaging,
  validatePricing,
} from '../../../shared/utils/medicine-helpers.js';

class BulkImportService {
  async analyzeOrCommit(payload, tenantId, branchId, userId) {
    const {
      medicines = [],
      supplier: supplierName = 'None',
      duplicateStrategy = 'Skip',
      barcodeOptions = { autoGen: true, overwrite: false, validate: true },
      dryRun = true,
    } = payload;

    let resolvedSupplierId = null;
    if (supplierName && supplierName !== 'None') {
      const supplier = await prisma.supplier.findFirst({
        where: { tenantId, name: { equals: supplierName, mode: 'insensitive' }, deletedAt: null },
        select: { id: true },
      });
      if (supplier) resolvedSupplierId = supplier.id;
    }

    const analysis = {
      new: 0,
      duplicates: 0,
      conflicts: 0,
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
      const barcode = rawRow.barcode ? String(rawRow.barcode).trim() : '';
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
        select: { id: true, name: true, barcode: true, categoryId: true, manufacturerId: true },
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
        select: { id: true, name: true, barcode: true, categoryId: true, manufacturerId: true },
      });
      existingMedicines.push(...batchResult);
    }

    const medicineMapByName = new Map();
    const medicineMapByBarcode = new Map();
    for (const med of existingMedicines) {
      if (med.name) medicineMapByName.set(med.name.toLowerCase().trim(), med);
      if (med.barcode) medicineMapByBarcode.set(med.barcode.trim(), med);
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
      const barcode = rawRow.barcode ? String(rawRow.barcode).trim() : '';
      const category = rawRow.category ? String(rawRow.category).trim() : '';

      const manufacturer = rawRow.manufacturer ? String(rawRow.manufacturer).trim() : '';

      const genericName = rawRow.genericName ? String(rawRow.genericName).trim() : '';

      const strength = rawRow.strength ? String(rawRow.strength).trim() : '';

      const dosageForm = rawRow.dosageForm ? String(rawRow.dosageForm).trim() : '';

      const hsnCode = rawRow.hsnCode ? String(rawRow.hsnCode).trim() : '';

      const gstPercentage = this._parseGst(rawRow.gstPercentage);

      const validationErrors = [];
      const validationWarnings = [];

      if (!name) {
        validationErrors.push('Medicine name is required');
      }

      const qty = this._parseQuantity(qtyStr);
      if (isNaN(qty) || qty <= 0) {
        validationErrors.push('Invalid quantity (must be greater than zero)');
      }

      let expiryDate = null;
      let isExpired = false;
      if (expiryStr) {
        expiryDate = this.parseExpiryDate(expiryStr);
        if (!expiryDate) {
          validationErrors.push(`Invalid expiry date format: "${expiryStr}"`);
        } else if (expiryDate < new Date()) {
          isExpired = true;
          validationWarnings.push(
            `Medicine already expired (${expiryStr}) — importing as expired stock`,
          );
        }
      }

      const price = this._parsePrice(priceStr);
      const pricingError = validatePricing({
        purchasePrice: price,
        sellingPrice: price * 1.2,
        mrp: price * 1.2,
      });
      if (pricingError) {
        validationErrors.push(pricingError);
      }

      if (barcode) {
        analysis.validBarcodes++;
        if (barcodeOptions.validate) {
          const isValidFormat = /^[a-zA-Z0-9._-]{4,30}$/.test(barcode);
          if (!isValidFormat) {
            validationWarnings.push(`Barcode "${barcode}" has unusual format — importing anyway`);
          }
        }
      } else if (barcodeOptions.autoGen) {
        analysis.autoGenBarcodes++;
      }

      if (validationErrors.length > 0) {
        analysis.errors.push({
          row: rowNum,
          name: name || '[blank]',
          reason: validationErrors.join('; '),
          warnings: validationWarnings,
          action: 'Skip',
        });
        continue;
      }

      let matchedMedicine = null;
      const normName = name.toLowerCase().trim();
      const normBarcode = barcode ? barcode.trim() : '';

      if (medicineMapByName.has(normName)) {
        matchedMedicine = medicineMapByName.get(normName);
      } else if (normBarcode && medicineMapByBarcode.has(normBarcode)) {
        matchedMedicine = medicineMapByBarcode.get(normBarcode);
      }

      preValidatedRows.push({
        rowNum,
        name,
        qty,
        expiryDate,
        price,
        batch: batch || `IMP-${crypto.randomUUID().substring(0, 8).toUpperCase()}`,
        barcode:
          barcode ||
          (barcodeOptions.autoGen
            ? `BC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`
            : null),
        matchedMedicine,
        category,
        manufacturer,
        genericName,
        strength,
        dosageForm,
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

    const latestBatchMap = new Map();
    if (matchedMedicineIds.length > 0) {
      const latestBatches = await prisma.inventoryBatch.findMany({
        where: {
          tenantId,
          medicineId: { in: matchedMedicineIds },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const batch of latestBatches) {
        if (!latestBatchMap.has(batch.medicineId)) {
          latestBatchMap.set(batch.medicineId, batch);
        }
      }
    }

    const validatedRows = [];
    for (const row of preValidatedRows) {
      let isDuplicate = false;
      let isConflict = false;
      let matchType = 'NONE';
      let diffDesc = '';
      const matchedMedicine = row.matchedMedicine;

      if (matchedMedicine) {
        isDuplicate = true;
        analysis.duplicates++;

        if (matchedMedicine.name.toLowerCase() === row.name.toLowerCase()) {
          matchType = 'EXACT';
        } else if (row.barcode && matchedMedicine.barcode === row.barcode) {
          matchType = 'BARCODE';
        } else {
          matchType = 'FUZZY';
        }

        const existingBatch = latestBatchMap.get(matchedMedicine.id);

        if (
          row.barcode &&
          matchedMedicine.name.toLowerCase() !== row.name.toLowerCase() &&
          matchedMedicine.barcode === row.barcode
        ) {
          isConflict = true;
          analysis.conflicts++;
          diffDesc = `Barcode ${row.barcode} matches existing medicine "${matchedMedicine.name}" in system`;
        } else if (matchedMedicine.name.toLowerCase() === row.name.toLowerCase()) {
          if (
            row.price > 0 &&
            existingBatch &&
            Math.abs(row.price - Number(existingBatch.purchasePrice)) > 0.01
          ) {
            diffDesc = `Unit price mismatch (Imported: INR ${row.price} vs System: INR ${Number(existingBatch.purchasePrice)})`;
          }
        }

        analysis.rows.push({
          row: row.rowNum,
          name: row.name,
          match: matchedMedicine.name,
          type: matchType,
          severity: isConflict ? 'danger' : 'warning',
          diff: diffDesc || 'None (Details match)',
          conflict: isConflict,
        });
      } else {
        analysis.new++;
      }

      analysis.readyCount++;

      validatedRows.push({
        ...row,
        isDuplicate,
        isConflict,
      });
    }

    if (dryRun) {
      return { success: true, dryRun: true, summary: analysis };
    }

    const commitSummary = {
      importedCount: 0,
      newMedicinesCount: 0,
      newBatchesCount: 0,
      skippedCount: 0,
      overwrittenCount: 0,
      mergedCount: 0,
    };

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

    const CHUNK_SIZE = 500;

    for (let i = 0; i < validatedRows.length; i += CHUNK_SIZE) {
      const chunk = validatedRows.slice(i, i + CHUNK_SIZE);

      const start = Date.now();

      logger.info(
        {
          chunk: i / CHUNK_SIZE + 1,
          totalChunks: Math.ceil(validatedRows.length / CHUNK_SIZE),
        },
        'Bulk import chunk',
      );

      await prisma.$transaction(
        async (tx) => {
          const batchesToCreate = [];
          const movementsToCreate = [];
          const inventoryUpdates = [];

          for (const row of chunk) {
            let medicineId = null;

            const normName = row.name.toLowerCase().trim();
            const normBarcode = row.barcode ? row.barcode.trim() : '';

            let currentMatch =
              medicineMapByName.get(normName) ||
              (normBarcode ? medicineMapByBarcode.get(normBarcode) : null);

            if (currentMatch) {
              medicineId = currentMatch.id;

              if (row.isDuplicate) {
                if (duplicateStrategy === 'Skip') {
                  commitSummary.skippedCount++;
                  continue;
                }

                if (duplicateStrategy === 'Overwrite') {
                  commitSummary.overwrittenCount++;
                  const updatePayload = {};
                  if (row.barcode && (barcodeOptions.overwrite || !currentMatch.barcode)) {
                    updatePayload.barcode = row.barcode;
                    currentMatch.barcode = row.barcode;
                    medicineMapByBarcode.set(row.barcode.trim(), currentMatch);
                  }
                  if (row.category) {
                    const resolvedCatId = categoryMap.get(row.category.trim().toLowerCase());
                    if (resolvedCatId) {
                      updatePayload.categoryId = resolvedCatId;
                      currentMatch.categoryId = resolvedCatId;
                    }
                  }
                  if (row.manufacturer) {
                    const resolvedMfrId = manufacturerMap.get(
                      row.manufacturer.trim().toLowerCase(),
                    );
                    if (resolvedMfrId) {
                      updatePayload.manufacturerId = resolvedMfrId;
                      currentMatch.manufacturerId = resolvedMfrId;
                    }
                  }
                  if (Object.keys(updatePayload).length > 0) {
                    await tx.medicine.update({
                      where: { id: medicineId },
                      data: updatePayload,
                    });
                  }
                } else if (duplicateStrategy === 'Merge') {
                  commitSummary.mergedCount++;
                  const updatePayload = {};
                  if (row.barcode && !currentMatch.barcode) {
                    updatePayload.barcode = row.barcode;
                    currentMatch.barcode = row.barcode;
                    medicineMapByBarcode.set(row.barcode.trim(), currentMatch);
                  }
                  if (row.category && !currentMatch.categoryId) {
                    const resolvedCatId = categoryMap.get(row.category.trim().toLowerCase());
                    if (resolvedCatId) {
                      updatePayload.categoryId = resolvedCatId;
                      currentMatch.categoryId = resolvedCatId;
                    }
                  }
                  if (row.manufacturer && !currentMatch.manufacturerId) {
                    const resolvedMfrId = manufacturerMap.get(
                      row.manufacturer.trim().toLowerCase(),
                    );
                    if (resolvedMfrId) {
                      updatePayload.manufacturerId = resolvedMfrId;
                      currentMatch.manufacturerId = resolvedMfrId;
                    }
                  }
                  if (Object.keys(updatePayload).length > 0) {
                    await tx.medicine.update({
                      where: { id: medicineId },
                      data: updatePayload,
                    });
                  }
                }
              }
            } else {
              let categoryId = row.category
                ? categoryMap.get(row.category.trim().toLowerCase()) || null
                : null;

              let manufacturerId = row.manufacturer
                ? manufacturerMap.get(row.manufacturer.trim().toLowerCase()) || null
                : null;

              const newMed = await tx.medicine.create({
                data: {
                  tenantId,
                  userId,
                  name: row.name,
                  genericName: row.genericName || null,
                  barcode: row.barcode,
                  hsnCode: row.hsnCode || null,
                  dosageForm: row.dosageForm || null,
                  packagingType: mapDosageFormToPackaging(row.dosageForm),
                  strength: row.strength || null,
                  sku: `SKU-${crypto.randomUUID()}`,
                  gstPercentage: row.gstPercentage || 0,
                  reorderLevel: 10,
                  status: 'ACTIVE',
                  isActive: true,
                  categoryId: categoryId || null,
                  manufacturerId: manufacturerId || null,
                },
              });
              medicineId = newMed.id;
              commitSummary.newMedicinesCount++;

              const cachedMed = { id: medicineId, name: row.name, barcode: row.barcode };
              medicineMapByName.set(normName, cachedMed);
              if (row.barcode) {
                medicineMapByBarcode.set(row.barcode.trim(), cachedMed);
              }
            }

            if (row.qty > 0) {
              const defaultExpiry = new Date(new Date().setFullYear(new Date().getFullYear() + 2));
              const _tempBatchId = crypto.randomUUID();
              batchesToCreate.push({
                _tempBatchId,
                tenantId,
                medicineId,
                branchId,
                batchNumber: row.batch,
                quantity: row.qty,
                receivedQuantity: row.qty,
                availableQuantity: row.qty,
                expiryDate: row.expiryDate || defaultExpiry,
                purchasePrice: row.price || 0,
                sellingPrice: (row.price || 0) * 1.2,
                mrp: (row.price || 0) * 1.2,
                status: 'ACTIVE',
                supplierId: resolvedSupplierId,
              });

              movementsToCreate.push({
                _tempBatchId,
                tenantId,
                branchId,
                medicineId,
                movementType: 'STOCK_IN',
                quantity: row.qty,
                referenceType: 'BULK_IMPORT',
                performedBy: userId,
                notes: `Bulk imported from ${supplierName !== 'None' ? supplierName : 'spreadsheet'}`,
              });

              inventoryUpdates.push({ medicineId, qty: row.qty });
              commitSummary.newBatchesCount++;
            }

            commitSummary.importedCount++;
          }

          const batchIdMap = new Map();
          if (batchesToCreate.length > 0) {
            for (const b of batchesToCreate) {
              const { _tempBatchId, ...data } = b;
              const created = await tx.inventoryBatch.create({ data });
              batchIdMap.set(_tempBatchId, created.id);
            }
          }

          if (movementsToCreate.length > 0) {
            const resolvedMovements = movementsToCreate.map((m) => {
              const { _tempBatchId, ...data } = m;
              return { ...data, batchId: batchIdMap.get(_tempBatchId) || undefined };
            });
            await tx.stockMovement.createMany({ data: resolvedMovements });
          }

          const stockMap = new Map();
          for (const inv of inventoryUpdates) {
            stockMap.set(inv.medicineId, (stockMap.get(inv.medicineId) || 0) + inv.qty);
          }

          for (const [medicineId, qty] of stockMap) {
            await tx.inventory.upsert({
              where: {
                tenantId_branchId_medicineId: { tenantId, branchId, medicineId },
              },
              update: { currentStock: { increment: qty } },
              create: {
                tenantId,
                branchId,
                medicineId,
                currentStock: qty,
                reorderPoint: 10,
              },
            });
          }
        },
        { timeout: 60000 },
      );

      logger.info(
        {
          chunk: i / CHUNK_SIZE + 1,
          durationMs: Date.now() - start,
        },
        'Chunk completed',
      );
    }

    const importJob = await prisma.importJob.create({
      data: {
        tenantId,
        importType: 'BULK_MEDICINES',
        importStatus: 'COMPLETED',
        uploadedBy: userId,
        fileName: 'bulk_import.csv',
        processedAt: new Date(),
        extractedData: {
          strategy: duplicateStrategy,
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
      summary: {
        new: commitSummary.newMedicinesCount,
        duplicates: commitSummary.overwrittenCount + commitSummary.mergedCount,
        conflicts: commitSummary.skippedCount,
        rows: [],
        errors: analysis.errors,
        readyCount: commitSummary.importedCount,
        importedCount: commitSummary.importedCount,
        skippedCount: analysis.errors.length,
        newBatchesCount: commitSummary.newBatchesCount,
      },
    };
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
}

export default new BulkImportService();
