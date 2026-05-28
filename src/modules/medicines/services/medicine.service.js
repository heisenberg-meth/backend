import medicineRepository from '../repositories/medicine.repository.js';
import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import { mainQueue } from '../../../queue/index.js';
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
      console.error('[REDIS CACHE ERROR]', err);
    }

    const { q, search, categoryId, manufacturerId, isActive, lowStock, sortBy, order, schedule } = query;
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
      console.error('[REDIS CACHE ERROR]', err);
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
      console.error('[REDIS CACHE ERROR]', err);
    }
  }

  /**
   * Retrieve single medicine with intelligence (interactions, alternatives, pricing)
   */
  async getMedicineDetails(id, tenantId) {
    const medicine = await medicineRepository.findById(id, tenantId);
    if (!medicine) throw new Error('Medicine not found');

    return {
      medicine,
      pricing: medicine.pricingMaster[0] || null,
      inventorySummary: {
        totalStock: medicine.inventoryBatches.reduce((sum, b) => sum + b.quantity, 0),
        batches: medicine.inventoryBatches
      },
      alternatives: medicine.alternatives.map(a => a.alternative),
      interactions: medicine.interactions.map(i => ({
        medicine: i.interactsWith,
        severity: i.severity,
        description: i.description
      }))
    };
  }

  /**
   * Create a new drug master record with governance
   */
  async createMedicineMaster(tenantId, userId, data) {
    const { pricing, initialBatch, branchId, reorderPoint, rackLocation, category, manufacturer, ...rawMedicineData } = data;

    if (!branchId) {
      throw new Error('Branch ID is required to create medicine inventory');
    }

    // 1. Validation: Barcode & SKU Uniqueness
    if (rawMedicineData.barcode) {
      const existing = await medicineRepository.findByBarcode(rawMedicineData.barcode, tenantId);
      if (existing) throw new Error(`Barcode ${rawMedicineData.barcode} is already assigned to ${existing.name}`);
    }

    if (rawMedicineData.sku) {
      const existing = await prisma.medicine.findFirst({
        where: { sku: rawMedicineData.sku, tenantId, deletedAt: null }
      });
      if (existing) throw new Error(`SKU ${rawMedicineData.sku} is already assigned to ${existing.name}`);
    }

    // 2. Resolve Category ID from name if not provided
    let categoryId = data.categoryId || null;
    if (!categoryId && category) {
      const catName = category.trim();
      const existingCat = await prisma.medicineCategory.findFirst({
        where: {
          tenantId,
          name: { equals: catName, mode: 'insensitive' },
          deletedAt: null
        }
      });
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const newCat = await prisma.medicineCategory.create({
          data: {
            name: catName,
            tenantId
          }
        });
        categoryId = newCat.id;
      }
    }

    // 3. Resolve Manufacturer ID from name if not provided
    let manufacturerId = data.manufacturerId || null;
    if (!manufacturerId && manufacturer) {
      const mfgName = manufacturer.trim();
      const existingMfg = await prisma.manufacturer.findFirst({
        where: {
          tenantId,
          name: { equals: mfgName, mode: 'insensitive' },
          deletedAt: null
        }
      });
      if (existingMfg) {
        manufacturerId = existingMfg.id;
      } else {
        const newMfg = await prisma.manufacturer.create({
          data: {
            name: mfgName,
            tenantId
          }
        });
        manufacturerId = newMfg.id;
      }
    }

    // 4. Validation: Schedule Drug Rules
    if (['Schedule H', 'Schedule H1', 'Schedule X'].includes(rawMedicineData.scheduleType)) {
      rawMedicineData.prescriptionRequired = true;
    }

    // Clean up rawMedicineData to avoid passing IDs directly if using connect
    delete rawMedicineData.categoryId;
    delete rawMedicineData.manufacturerId;

    return await prisma.$transaction(async (tx) => {
      // 5. Create Master Record
      const medicine = await tx.medicine.create({
        data: {
          ...rawMedicineData,
          category: categoryId ? { connect: { id: categoryId } } : undefined,
          manufacturer: manufacturerId ? { connect: { id: manufacturerId } } : undefined,
          tenant: { connect: { id: tenantId } },
          user: { connect: { id: userId } }
        }
      });

      // 6. Initialize Pricing Master
      if (pricing) {
        await tx.medicinePricing.create({
          data: {
            ...pricing,
            tenant: { connect: { id: tenantId } },
            medicine: { connect: { id: medicine.id } }
          }
        });
      }

      // 7. Initialize Branch Availability Snapshot
      await tx.inventory.upsert({
        where: {
          tenantId_branchId_medicineId: { tenantId, branchId, medicineId: medicine.id }
        },
        update: {
          reorderPoint: reorderPoint ?? 10,
          rackLocation: rackLocation || null
        },
        create: {
          tenantId,
          branchId,
          medicineId: medicine.id,
          reorderPoint: reorderPoint ?? 10,
          rackLocation: rackLocation || null,
          currentStock: 0
        }
      });

      // 8. Create Initial Batch via MovementService (Ledger-driven)
      if (initialBatch) {
        await movementService.stockIn(tenantId, {
          ...initialBatch,
          medicineId: medicine.id,
          branchId,
          referenceType: 'INITIAL_STOCK',
          notes: 'Initial inventory during medicine creation'
        }, userId, tx);
      }

      await auditService.log({
        tenantId,
        userId,
        action: 'CREATE_MEDICINE_MASTER',
        target: medicine.name,
        type: 'PHARMACEUTICAL'
      });

      await this.invalidateCache(tenantId);
      await mainQueue.add('update-analytics', { tenantId });
      await eventBus.publish('MEDICINE_CREATED', { medicineId: medicine.id, tenantId });

      return medicine;
    });
  }

  /**
   * Update master data with restricted field governance
   */
  async updateMedicineMaster(id, tenantId, userId, userRole, data) {
    const existing = await medicineRepository.findById(id, tenantId);
    if (!existing) throw new Error('Medicine not found');

    // Governance: Restricted Fields
    const restrictedFields = ['barcode', 'scheduleType', 'gstPercentage'];
    const isAttemptingRestrictedUpdate = restrictedFields.some(field => data[field] !== undefined && data[field] !== existing[field]);

    if (isAttemptingRestrictedUpdate && userRole !== 'OWNER' && userRole !== 'ADMIN') {
      throw new Error('Only owners or admins can update barcode, schedule type, or GST classification.');
    }

    // Uniqueness checks for barcode/sku if they are being changed
    if (data.barcode && data.barcode !== existing.barcode) {
      const existingWithBarcode = await medicineRepository.findByBarcode(data.barcode, tenantId);
      if (existingWithBarcode) throw new Error(`Barcode ${data.barcode} is already assigned to ${existingWithBarcode.name}`);
    }

    if (data.sku && data.sku !== existing.sku) {
      const existingWithSku = await prisma.medicine.findFirst({
        where: { sku: data.sku, tenantId, deletedAt: null }
      });
      if (existingWithSku) throw new Error(`SKU ${data.sku} is already assigned to ${existingWithSku.name}`);
    }

    // Resolve Category ID from name if not provided
    let categoryId = data.categoryId;
    if (categoryId === undefined && data.category) {
      const catName = data.category.trim();
      const existingCat = await prisma.medicineCategory.findFirst({
        where: {
          tenantId,
          name: { equals: catName, mode: 'insensitive' },
          deletedAt: null
        }
      });
      if (existingCat) {
        categoryId = existingCat.id;
      } else {
        const newCat = await prisma.medicineCategory.create({
          data: {
            name: catName,
            tenantId
          }
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
          deletedAt: null
        }
      });
      if (existingMfg) {
        manufacturerId = existingMfg.id;
      } else {
        const newMfg = await prisma.manufacturer.create({
          data: {
            name: mfgName,
            tenantId
          }
        });
        manufacturerId = newMfg.id;
      }
    }

    const cleanData = { ...data };
    delete cleanData.category;
    delete cleanData.manufacturer;
    delete cleanData.statusReason;
    const updateData = {
      ...cleanData,
      ...(categoryId !== undefined && { 
        category: categoryId ? { connect: { id: categoryId } } : { disconnect: true } 
      }),
      ...(manufacturerId !== undefined && { 
        manufacturer: manufacturerId ? { connect: { id: manufacturerId } } : { disconnect: true } 
      })
    };
    delete updateData.categoryId;
    delete updateData.manufacturerId;

    const statusChanged = (data.status && data.status !== existing.status) || 
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
            changedByUser: { connect: { id: userId } }
          }
        });
      }
      return result;
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_MEDICINE_MASTER',
      target: updated.name,
      type: 'PHARMACEUTICAL'
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
          changedByUser: { connect: { id: userId } }
        }
      });
      return result;
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'DEACTIVATE_MEDICINE',
      target: updated.name,
      type: 'PHARMACEUTICAL'
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
      metadata: { reason, severity }
    });

    return { message: `Batch ${batchNumber} flagged for recall`, affected: result.count };
  }

  async addBatch(medicineId, tenantId, batchData, userId) {
    const medicine = await medicineRepository.findById(medicineId, tenantId);
    if (!medicine) throw new Error('Medicine not found');
    
    const batch = await movementService.stockIn(tenantId, {
      ...batchData,
      medicineId,
      referenceType: 'MANUAL_ADD_BATCH',
      notes: batchData.notes || `Manually added batch for ${medicine.name}`
    }, userId);

    await this.invalidateCache(tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'ADD_BATCH',
      target: `${medicine.name} - Batch ${batch.batchNumber}`,
      type: 'PHARMACEUTICAL'
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
      type: 'PHARMACEUTICAL'
    });
  }
}

export default new MedicineIntelligenceService();
