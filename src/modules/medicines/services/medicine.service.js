import medicineRepository from '../repositories/medicine.repository.js';
import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import { mainQueue } from '../../../queue/index.js';
import { mapDosageFormToPackaging } from '../../../shared/utils/medicine-helpers.js';
import movementService from '../../stock/service/movement.service.js';

class MedicineIntelligenceService {
  /**
   * Search and filter medicine master records
   */
  async getMedicines(params) {
    const { tenantId, branchId, query = {}, pagination = {} } = params;

    // Caching Key
    const cacheKey = `inventory:${tenantId}:${branchId || 'all'}:${JSON.stringify(query)}:${JSON.stringify(pagination)}`;

    try {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (err) {
      logger.warn('[REDIS CACHE ERROR]', err);
    }

    const { q, search, categoryId, manufacturerId, isActive, lowStock, sortBy, order, schedule } =
      query;
    const { page = 1, limit = 50 } = pagination;

    const result = await medicineRepository.findAll({
      tenantId,
      branchId,
      q,
      search,
      categoryId,
      manufacturerId,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      schedule,
      lowStock: lowStock === 'true' || lowStock === true,
      sortBy,
      order,
      page,
      limit,
    });

    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    } catch (err) {
      logger.warn('[REDIS CACHE ERROR]', err);
    }

    return result;
  }

  async invalidateCache(tenantId) {
    try {
      const keys = await scanKeys(`inventory:${tenantId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (err) {
      logger.warn('[REDIS CACHE ERROR]', err);
    }
  }

  /**
   * Retrieve single medicine with intelligence (interactions, alternatives, pricing)
   */
  async getMedicineDetails(id, tenantId) {
    const medicine = await medicineRepository.findById(id, tenantId);
    if (!medicine) throw new Error('Medicine not found');
    return medicine;
  }

  /**
   * Create a new drug master record with governance
   * Medicine Master only - no stock, no batch, no supplier, no inventory
   */
  async createMedicineMaster(tenantId, userId, data) {
    const { category, manufacturer, ...rawMedicineData } = data;
    const medicineName = rawMedicineData.medicineName || rawMedicineData.name;

    // Required field validations
    if (!medicineName) {
      throw new Error('Medicine name is required');
    }
    const genericName = rawMedicineData.genericName || medicineName;
    const dosageForm = rawMedicineData.dosageForm || 'Tablet';
    const medicineType = rawMedicineData.medicineType || 'ALLOPATHIC';
    const strength = rawMedicineData.strength || 'N/A';
    const manufacturerName =
      rawMedicineData.manufacturerName ||
      rawMedicineData.manufacturer ||
      manufacturer ||
      'Generic Manufacturer';

    // GST validation
    const validGstPercentages = [0, 5, 12, 18, 28];
    if (
      rawMedicineData.gstPercentage !== undefined &&
      !validGstPercentages.includes(rawMedicineData.gstPercentage)
    ) {
      throw new Error(`GST percentage must be one of: ${validGstPercentages.join(', ')}`);
    }

    // unitPerPack validation
    if (rawMedicineData.unitPerPack !== undefined && rawMedicineData.unitPerPack <= 0) {
      throw new Error('Unit per pack must be greater than 0');
    }

    // Barcode & SKU Uniqueness
    if (rawMedicineData.barcode) {
      const existing = await medicineRepository.findByBarcode(rawMedicineData.barcode, tenantId);
      if (existing)
        throw new Error(
          `Barcode ${rawMedicineData.barcode} is already assigned to ${existing.medicineName || existing.name}`,
        );
    }

    if (rawMedicineData.sku) {
      const existing = await prisma.medicine.findFirst({
        where: { sku: rawMedicineData.sku, tenantId, deletedAt: null },
      });
      if (existing)
        throw new Error(
          `SKU ${rawMedicineData.sku} is already assigned to ${existing.medicineName || existing.name}`,
        );
    }

    // Resolve Category ID from name if not provided
    let categoryId = data.categoryId || null;
    if (!categoryId && category) {
      const catName = category.trim();
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
    let manufacturerId = data.manufacturerId || null;
    if (!manufacturerId && (manufacturer || rawMedicineData.manufacturerName)) {
      const mfgName = (manufacturer || rawMedicineData.manufacturerName).trim();
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

    // Schedule Drug Rules - auto-set prescription required
    if (['SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'].includes(rawMedicineData.schedule)) {
      rawMedicineData.requiresPrescription = true;
    }
    // Also handle legacy scheduleType field
    if (['Schedule H', 'Schedule H1', 'Schedule X'].includes(rawMedicineData.scheduleType)) {
      rawMedicineData.prescriptionRequired = true;
      rawMedicineData.requiresPrescription = true;
    }

    // Clean up data for create
    const createData = {
      name: medicineName,
      medicineName: medicineName,
      genericName: genericName,
      brandName: rawMedicineData.brandName || medicineName,
      manufacturerName: manufacturerName,
      medicineType: medicineType,
      dosageForm: dosageForm,
      strength: strength,
      schedule: rawMedicineData.schedule,
      purchaseUnit: rawMedicineData.purchaseUnit || 'STRIP',
      sellingUnit: rawMedicineData.sellingUnit || 'STRIP',
      unitPerPack: rawMedicineData.unitPerPack || 10,
      gstPercentage: rawMedicineData.gstPercentage ?? 0,
      hsnCode: rawMedicineData.hsnCode,
      barcode: rawMedicineData.barcode,
      sku: rawMedicineData.sku,
      requiresPrescription: rawMedicineData.requiresPrescription ?? false,
      prescriptionRequired:
        rawMedicineData.prescriptionRequired ?? rawMedicineData.requiresPrescription ?? false,
      storageCondition: rawMedicineData.storageCondition,
      status: rawMedicineData.status || 'ACTIVE',
      notes: rawMedicineData.notes,
      isActive: rawMedicineData.isActive ?? true,
      packagingType: rawMedicineData.packagingType || mapDosageFormToPackaging(dosageForm),
      scheduleType: rawMedicineData.scheduleType,
      composition: rawMedicineData.composition,
      description: rawMedicineData.description,
    };

    const medicine = await prisma.$transaction(async (tx) => {
      // Create Master Record
      const med = await tx.medicine.create({
        data: {
          ...createData,
          category: categoryId ? { connect: { id: categoryId } } : undefined,
          manufacturer: manufacturerId ? { connect: { id: manufacturerId } } : undefined,
          tenant: tenantId ? { connect: { id: tenantId } } : undefined,
          user: userId ? { connect: { id: userId } } : undefined,
        },
        include: {
          category: { select: { id: true, name: true } },
        },
      });

      if (auditService?.log) {
        await auditService.log({
          tenantId,
          userId,
          action: 'CREATE_MEDICINE_MASTER',
          target: med.medicineName || med.name,
          type: 'PHARMACEUTICAL',
        });
      }

      return med;
    });

    if (data.initialBatch && data.initialBatch.batchNumber) {
      await movementService.stockIn(
        tenantId,
        {
          ...data.initialBatch,
          medicineId: medicine.id,
          branchId: data.branchId,
          referenceType: 'INITIAL_STOCK',
          notes: `Initial stock for ${medicine.medicineName || medicine.name}`,
        },
        userId,
      );
    }

    await this.invalidateCache(tenantId);
    if (mainQueue?.add) {
      await mainQueue.add('update-analytics', { tenantId });
    }
    if (eventBus?.publish) {
      await eventBus.publish('MEDICINE_CREATED', { medicineId: medicine.id, tenantId });
    }

    return medicine;
  }

  /**
   * Update master data with restricted field governance
   */
  async updateMedicineMaster(id, tenantId, userId, userRole, data) {
    const existing = await medicineRepository.findById(id, tenantId);
    if (!existing) throw new Error('Medicine not found');

    // Governance: Restricted Fields
    const restrictedFields = ['barcode', 'schedule', 'scheduleType', 'gstPercentage'];
    const isAttemptingRestrictedUpdate = restrictedFields.some(
      (field) => data[field] !== undefined && data[field] !== existing[field],
    );

    if (isAttemptingRestrictedUpdate && userRole !== 'OWNER' && userRole !== 'ADMIN') {
      throw new Error(
        'Only owners or admins can update barcode, schedule type, or GST classification.',
      );
    }

    // Uniqueness checks for barcode/sku if they are being changed
    if (data.barcode && data.barcode !== existing.barcode) {
      const existingWithBarcode = await medicineRepository.findByBarcode(data.barcode, tenantId);
      if (existingWithBarcode)
        throw new Error(
          `Barcode ${data.barcode} is already assigned to ${existingWithBarcode.medicineName}`,
        );
    }

    if (data.sku && data.sku !== existing.sku) {
      const existingWithSku = await prisma.medicine.findFirst({
        where: { sku: data.sku, tenantId, deletedAt: null },
      });
      if (existingWithSku)
        throw new Error(`SKU ${data.sku} is already assigned to ${existingWithSku.medicineName}`);
    }

    // GST validation
    const validGstPercentages = [0, 5, 12, 18, 28];
    if (data.gstPercentage !== undefined && !validGstPercentages.includes(data.gstPercentage)) {
      throw new Error(`GST percentage must be one of: ${validGstPercentages.join(', ')}`);
    }

    // unitPerPack validation
    if (data.unitPerPack !== undefined && data.unitPerPack <= 0) {
      throw new Error('Unit per pack must be greater than 0');
    }

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

    // Schedule Drug Rules - auto-set prescription required
    if (data.schedule && ['SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'].includes(data.schedule)) {
      data.requiresPrescription = true;
    }
    if (
      data.scheduleType &&
      ['Schedule H', 'Schedule H1', 'Schedule X'].includes(data.scheduleType)
    ) {
      data.prescriptionRequired = true;
      data.requiresPrescription = true;
    }

    const cleanData = { ...data };
    delete cleanData.category;
    delete cleanData.manufacturer;
    delete cleanData.statusReason;
    delete cleanData.categoryId;
    delete cleanData.manufacturerId;
    delete cleanData.supplierId;

    let supplierId = data.supplierId;
    if (supplierId) {
      const existingSup = await prisma.supplier.findFirst({
        where: { id: supplierId, deletedAt: null },
      });
      if (!existingSup) {
        throw new Error('Supplier not found');
      }
      if (existingSup.tenantId !== tenantId) {
        throw new Error('Supplier does not belong to your organization');
      }
    }

    if (cleanData.dosageForm !== undefined) {
      cleanData.packagingType = mapDosageFormToPackaging(cleanData.dosageForm);
    }

    const updateData = {
      ...cleanData,
      ...(categoryId !== undefined && {
        category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
      }),
      ...(manufacturerId !== undefined && {
        manufacturer: manufacturerId ? { connect: { id: manufacturerId } } : { disconnect: true },
      }),
      ...(supplierId !== undefined && {
        supplier: supplierId ? { connect: { id: supplierId } } : { disconnect: true },
      }),
    };

    const statusChanged =
      (data.status && data.status !== existing.status) ||
      (data.isActive !== undefined && data.isActive !== existing.isActive);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await medicineRepository.update(id, tenantId, updateData, tx);

      if (statusChanged) {
        await tx.medicineStatusHistory.create({
          data: {
            tenant: { connect: { id: tenantId } },
            medicine: { connect: { id: id } },
            oldStatus: existing.status,
            newStatus: data.status || existing.status,
            reason: data.statusReason || 'Manual master update',
            changedByUser: { connect: { id: userId } },
          },
        });
      }
      return result;
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_MEDICINE_MASTER',
      target: updated.medicineName,
      type: 'PHARMACEUTICAL',
    });

    await this.invalidateCache(tenantId);
    await mainQueue.add('update-analytics', { tenantId });
    await eventBus.publish('MEDICINE_UPDATED', { medicineId: id, tenantId });

    return updated;
  }

  /**
   * Soft deactivation of drug master
   */
  async deactivateMedicine(id, tenantId, userId) {
    const existing = await medicineRepository.findById(id, tenantId);
    if (!existing) throw new Error('Medicine not found');

    const updated = await prisma.$transaction(async (tx) => {
      const result = await medicineRepository.softDelete(id, tenantId, tx);

      await tx.medicineStatusHistory.create({
        data: {
          tenant: { connect: { id: tenantId } },
          medicine: { connect: { id: id } },
          oldStatus: existing.status,
          newStatus: 'INACTIVE',
          reason: 'Medicine deactivation',
          changedByUser: { connect: { id: userId } },
        },
      });
      return result;
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'DEACTIVATE_MEDICINE',
      target: updated.name,
      type: 'PHARMACEUTICAL',
    });

    await this.invalidateCache(tenantId);
    await mainQueue.add('update-analytics', { tenantId });
    await eventBus.publish('MEDICINE_DEACTIVATED', { medicineId: id, tenantId });

    return { message: 'Medicine deactivated successfully' };
  }

  /**
   * Lookup medicine by barcode
   */
  async lookupByBarcode(barcode, tenantId) {
    const medicine = await medicineRepository.findByBarcode(barcode, tenantId);
    if (!medicine) throw new Error('Medicine not found for this barcode');
    return medicine;
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
      type: 'PHARMACEUTICAL',
      metadata: { reason, severity },
    });

    return { message: `Batch ${batchNumber} flagged for recall`, affected: result.count };
  }

  async addBatch(medicineId, tenantId, batchData, userId) {
    const medicine = await medicineRepository.findById(medicineId, tenantId);
    if (!medicine) throw new Error('Medicine not found');

    const batch = await movementService.stockIn(
      tenantId,
      {
        ...batchData,
        medicineId,
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
      type: 'PHARMACEUTICAL',
    });

    return batch;
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
      type: 'PHARMACEUTICAL',
    });
  }
}

export default new MedicineIntelligenceService();
