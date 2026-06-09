import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import medicineRepository from '../repository/medicine.prisma.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import { mainQueue } from '../../../queue/index.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import movementService from '../../stock/service/movement.service.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import inventoryBatchRepository from '../repository/inventory_batch.repository.js';
import {
  mapDosageFormToPackaging,
  validatePricing,
} from '../../../shared/utils/medicine-helpers.js';

class MedicinePrismaService {
  async getMedicines(params) {
    try {
      const { tenantId, branchId, query = {}, pagination = {} } = params;

      const cacheKey = `inventory:${tenantId}:${branchId || 'all'}:${JSON.stringify(query)}:${JSON.stringify(pagination)}`;

      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
      } catch (err) {
        logger.error({ err }, '[REDIS CACHE ERROR]');
      }

      const { search, categoryId, manufacturerId, isActive, lowStock, sortBy, order } = query;
      const { page = 1, limit = 20 } = pagination;

      const skip = (page - 1) * limit;

      const result = await medicineRepository.findAll({
        tenantId,
        branchId,
        search,
        categoryId,
        manufacturerId,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        lowStock: lowStock === 'true' || lowStock === true,
        sortBy,
        order,
        skip,
        take: limit,
      });

      try {
        await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
      } catch (err) {
        logger.error({ err }, '[REDIS CACHE ERROR]');
      }

      return result;
    } catch (err) {
      logger.error({ err }, '[MEDICINE SERVICE] getMedicines failed');
      throw err;
    }
  }

  async invalidateCache(tenantId) {
    try {
      const keys = await scanKeys(`inventory:${tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      console.error('[REDIS CACHE ERROR]', err);
    }
  }

  async getMedicine(id, tenantId, branchId = null) {
    const medicine = await medicineRepository.findById(id, tenantId, branchId);
    if (!medicine) {
      throw new Error('Medicine not found');
    }
    return medicine;
  }

  async getMedicineByBarcode(barcode, tenantId, branchId = null) {
    const medicine = await medicineRepository.findByBarcode(barcode, tenantId, branchId);
    if (!medicine) {
      throw new Error('Medicine not found');
    }
    return medicine;
  }

  async createMedicine(data, tenantId, userId) {
    try {
      logger.info({ tenantId, userId, payload: data }, '[INVENTORY] Attempting to create medicine');
      const { initialBatch, branchId, reorderPoint, rackLocation, ...rawMedicineData } = data;

      if (!branchId) {
        throw new Error('Branch ID is required to create medicine inventory');
      }

      if (
        initialBatch &&
        (initialBatch.purchasePrice || initialBatch.sellingPrice || initialBatch.mrp)
      ) {
        const pricingError = validatePricing({
          purchasePrice: initialBatch.purchasePrice || 0,
          sellingPrice: initialBatch.sellingPrice || 0,
          mrp: initialBatch.mrp || 0,
        });
        if (pricingError) {
          throw new Error(pricingError);
        }
      }

      // All database writes in a single atomic transaction
      const medicine = await prisma.$transaction(async (tx) => {
        let categoryId = rawMedicineData.categoryId || null;
        if (!categoryId && rawMedicineData.category) {
          const catName = rawMedicineData.category.trim();
          const existingCat = await tx.medicineCategory.findFirst({
            where: {
              tenantId,
              name: { equals: catName, mode: 'insensitive' },
              deletedAt: null,
            },
          });
          categoryId = existingCat
            ? existingCat.id
            : (
                await tx.medicineCategory.create({
                  data: { name: catName, tenantId },
                })
              ).id;
        }

        let manufacturerId = rawMedicineData.manufacturerId || null;
        if (!manufacturerId && rawMedicineData.manufacturer) {
          const mfgName = rawMedicineData.manufacturer.trim();
          const existingMfg = await tx.manufacturer.findFirst({
            where: {
              tenantId,
              name: { equals: mfgName, mode: 'insensitive' },
              deletedAt: null,
            },
          });
          manufacturerId = existingMfg
            ? existingMfg.id
            : (
                await tx.manufacturer.create({
                  data: { name: mfgName, tenantId },
                })
              ).id;
        }

        let status = 'ACTIVE';
        if (rawMedicineData.status) {
          const upperStatus = rawMedicineData.status.toUpperCase();
          if (['ACTIVE', 'DISCONTINUED', 'BLOCKED', 'RECALLED'].includes(upperStatus)) {
            status = upperStatus;
          }
        }

        let gstPercentage = 0;
        if (rawMedicineData.gstPercentage !== undefined) {
          gstPercentage = Number(rawMedicineData.gstPercentage);
        } else if (rawMedicineData.gst !== undefined) {
          gstPercentage = Number(rawMedicineData.gst);
        }

        const medicineData = {
          name: rawMedicineData.name,
          genericName: rawMedicineData.genericName || null,
          composition: rawMedicineData.composition || null,
          categoryId,
          manufacturerId,
          dosageForm: rawMedicineData.dosageForm || null,
          packagingType:
            rawMedicineData.packagingType || mapDosageFormToPackaging(rawMedicineData.dosageForm),
          strength: rawMedicineData.strength || null,
          unit: rawMedicineData.unit || null,
          scheduleType: rawMedicineData.scheduleType || rawMedicineData.schedule || null,
          storageCondition: rawMedicineData.storageCondition || null,
          prescriptionRequired:
            rawMedicineData.prescriptionRequired === true ||
            rawMedicineData.prescriptionRequired === 'true' ||
            ['Schedule H', 'Schedule H1', 'Schedule X'].includes(
              rawMedicineData.schedule || rawMedicineData.scheduleType,
            ) ||
            false,
          hsnCode: rawMedicineData.hsnCode || null,
          barcode: rawMedicineData.barcode || null,
          sku: rawMedicineData.sku || null,
          description: rawMedicineData.description || null,
          onlineDescription: rawMedicineData.onlineDescription || null,
          imageUrl: rawMedicineData.imageUrl || null,
          gstPercentage,
          reorderLevel:
            rawMedicineData.reorderLevel !== undefined ? Number(rawMedicineData.reorderLevel) : 10,
          reorderQuantity:
            rawMedicineData.reorderQuantity !== undefined
              ? Number(rawMedicineData.reorderQuantity)
              : null,
          status,
          isActive: rawMedicineData.isActive !== false,
          isPublished:
            rawMedicineData.isPublished === true || rawMedicineData.isPublished === 'true',
        };

        // 1. Create Medicine Catalog Entry
        const newMedicine = await medicineRepository.create(
          {
            ...medicineData,
            tenantId,
            userId,
          },
          tx,
        );

        // 2. Initialize Branch Inventory Snapshot
        await tx.inventory.upsert({
          where: {
            tenantId_branchId_medicineId: { tenantId, branchId, medicineId: newMedicine.id },
          },
          update: {
            reorderPoint: reorderPoint ?? 10,
            rackLocation: rackLocation || null,
          },
          create: {
            tenantId,
            branchId,
            medicineId: newMedicine.id,
            reorderPoint: reorderPoint ?? 10,
            rackLocation: rackLocation || null,
            currentStock: 0,
          },
        });

        // 3. Create Initial Batch + Stock Movement (only if initial stock provided)
        if (initialBatch && initialBatch.batchNumber && initialBatch.quantity > 0) {
          await movementService.stockIn(
            tenantId,
            {
              ...initialBatch,
              medicineId: newMedicine.id,
              branchId,
              referenceType: 'INITIAL_STOCK',
              notes: 'Initial inventory during medicine creation',
            },
            userId,
            tx,
          );
        }

        return newMedicine;
      });

      // Non-critical side effects (outside transaction)
      try {
        await this.invalidateCache(tenantId);
        await mainQueue.add('update-analytics', { tenantId });
        await auditService.log({
          tenantId,
          userId,
          action: 'CREATE_MEDICINE',
          target: medicine.name,
          type: 'INVENTORY',
        });
      } catch (sideEffectError) {
        logger.error(
          { err: sideEffectError.message },
          '[INVENTORY] Non-critical side-effect failed during medicine creation',
        );
      }

      return medicine;
    } catch (error) {
      logger.error(
        {
          err: error.message,
          stack: error.stack,
          tenantId,
          userId,
          payload: data,
        },
        '[INVENTORY] Create medicine failed',
      );
      throw error;
    }
  }

  async updateMedicine(id, tenantId, user, data) {
    // Resolve Category ID from name if not provided
    let categoryId = data.categoryId;
    if (categoryId === undefined && data.category) {
      const catName = data.category.trim();
      const existingCat = await prisma.medicineCategory.findFirst({
        where: {
          tenantId,
          name: { equals: catName, mode: 'insensitive' },
          deletedAt: null,
        },
      });
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const newCat = await prisma.medicineCategory.create({
          data: {
            name: catName,
            tenantId,
          },
        });
        categoryId = newCat.id;
      }
    }

    // Resolve Manufacturer ID from name if not provided
    let manufacturerId = data.manufacturerId;
    if (manufacturerId === undefined && data.manufacturer) {
      const mfgName = data.manufacturer.trim();
      const existingMfg = await prisma.manufacturer.findFirst({
        where: {
          tenantId,
          name: { equals: mfgName, mode: 'insensitive' },
          deletedAt: null,
        },
      });
      if (existingMfg) {
        manufacturerId = existingMfg.id;
      } else {
        const newMfg = await prisma.manufacturer.create({
          data: {
            name: mfgName,
            tenantId,
          },
        });
        manufacturerId = newMfg.id;
      }
    }

    // Map status enum safely
    let status = undefined;
    if (data.status) {
      const upperStatus = data.status.toUpperCase();
      if (['ACTIVE', 'DISCONTINUED', 'BLOCKED', 'RECALLED'].includes(upperStatus)) {
        status = upperStatus;
      }
    }

    // Map GST Percentage safely
    let gstPercentage = undefined;
    if (data.gstPercentage !== undefined) {
      gstPercentage = Number(data.gstPercentage);
    } else if (data.gst !== undefined) {
      gstPercentage = Number(data.gst);
    }

    // Filter and map exact Medicine fields matching the Prisma schema to avoid Unknown argument errors
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.genericName !== undefined) updateData.genericName = data.genericName;
    if (data.composition !== undefined) updateData.composition = data.composition;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (manufacturerId !== undefined) updateData.manufacturerId = manufacturerId;
    if (data.dosageForm !== undefined) {
      updateData.dosageForm = data.dosageForm;
      updateData.packagingType = mapDosageFormToPackaging(data.dosageForm);
    }
    if (data.packagingType !== undefined) updateData.packagingType = data.packagingType;
    if (data.strength !== undefined) updateData.strength = data.strength;
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType;
    else if (data.schedule !== undefined) updateData.scheduleType = data.schedule;
    if (data.storageCondition !== undefined) updateData.storageCondition = data.storageCondition;
    if (data.prescriptionRequired !== undefined) {
      updateData.prescriptionRequired =
        data.prescriptionRequired === true || data.prescriptionRequired === 'true';
    } else if (data.schedule !== undefined || data.scheduleType !== undefined) {
      const sched = data.schedule || data.scheduleType;
      if (['Schedule H', 'Schedule H1', 'Schedule X'].includes(sched)) {
        updateData.prescriptionRequired = true;
      }
    }
    if (data.hsnCode !== undefined) updateData.hsnCode = data.hsnCode;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.onlineDescription !== undefined) updateData.onlineDescription = data.onlineDescription;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (gstPercentage !== undefined) updateData.gstPercentage = gstPercentage;
    if (data.reorderLevel !== undefined) updateData.reorderLevel = Number(data.reorderLevel);
    if (data.reorderQuantity !== undefined)
      updateData.reorderQuantity = Number(data.reorderQuantity);
    if (status !== undefined) updateData.status = status;
    if (data.isActive !== undefined)
      updateData.isActive = data.isActive === true || data.isActive === 'true';
    if (data.isPublished !== undefined)
      updateData.isPublished = data.isPublished === true || data.isPublished === 'true';
    if (data.rackLocation !== undefined) updateData.rackLocation = data.rackLocation;

    const medicine = await medicineRepository.update(id, tenantId, updateData);

    await this.invalidateCache(tenantId);
    await mainQueue.add('update-analytics', { tenantId });

    await auditService.log({
      tenantId,
      userId: user.id,
      action: 'UPDATE_MEDICINE',
      target: medicine.name,
      type: 'INVENTORY',
    });

    // Emit Events
    await eventBus.publish('MEDICINE_UPDATED', { medicineId: medicine.id, tenantId });

    return medicine;
  }

  async deleteMedicine(id, tenantId, userId) {
    const medicine = await this.getMedicine(id, tenantId);

    const batches = await inventoryBatchRepository.findByMedicineId(id, medicine.branchId || null);

    for (const batch of batches) {
      await inventoryBatchRepository.delete(batch.id);
    }

    await medicineRepository.delete(id, tenantId);

    await this.invalidateCache(tenantId);
    await mainQueue.add('update-analytics', { tenantId });

    await auditService.log({
      tenantId,
      userId,
      action: 'DELETE_MEDICINE',
      target: medicine.name,
      type: 'INVENTORY',
    });
  }

  async searchMaster(query) {
    if (!query) return [];
    return prisma.medicine.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        deletedAt: null,
      },
      take: 10,
      select: {
        id: true,
        name: true,
        genericName: true,
        strength: true,
        dosageForm: true,
        unit: true,
      },
    });
  }

  async batchRecall(data, tenantId, userId) {
    const { batchNumber, reason, severity } = data;

    const result = await medicineRepository.flagBatchRecall(batchNumber, tenantId);

    await this.invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'BATCH_RECALL',
      target: `Batch ${batchNumber}`,
      type: 'INVENTORY',
      metadata: { reason, severity },
    });

    return { message: `Batch ${batchNumber} flagged for recall`, affected: result.count };
  }

  async clearAllMedicines(tenantId, userId) {
    await medicineRepository.deleteAll(tenantId);
    await this.invalidateCache(tenantId);
    await mainQueue.add('update-analytics', { tenantId });

    await auditService.log({
      tenantId,
      userId,
      action: 'CLEAR_INVENTORY',
      target: 'ALL_MEDICINES',
      type: 'INVENTORY',
    });
  }

  // Batch Management
  async addBatch(medicineId, tenantId, batchData, userId) {
    if (!batchData.branchId) {
      throw new Error('branchId is required to add a batch');
    }

    const medicine = await this.getMedicine(medicineId, tenantId, batchData.branchId);

    const batch = await movementService.stockIn(
      tenantId,
      {
        ...batchData,
        medicineId,
        branchId: batchData.branchId,
        referenceType: 'MANUAL_ADD_BATCH',
        notes: batchData.notes || `Manually added batch for ${medicine.name}`,
      },
      userId,
    );

    await this.invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'ADD_BATCH',
      target: `${medicine.name} - Batch ${batch.batchNumber}`,
      type: 'INVENTORY',
    });

    return batch;
  }
}

export default new MedicinePrismaService();
