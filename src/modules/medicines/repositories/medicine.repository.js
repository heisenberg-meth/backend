import prisma from '../../../config/prisma.js';

class MedicineRepository {
  async findAll({ tenantId, branchId, q, search, categoryId, manufacturerId, isActive, schedule, lowStock, sortBy, order, page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const take = limit;
    const searchTerm = q || search;

    const where = {
      tenantId,
      deletedAt: null,
      ...(isActive !== undefined && { isActive }),
      ...(categoryId && { categoryId }),
      ...(manufacturerId && { manufacturerId }),
      ...(schedule && { scheduleType: schedule }),
      ...(searchTerm && {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { genericName: { contains: searchTerm, mode: 'insensitive' } },
          { composition: { contains: searchTerm, mode: 'insensitive' } },
          { barcode: { contains: searchTerm, mode: 'insensitive' } },
          { sku: { contains: searchTerm, mode: 'insensitive' } },
        ],
      }),
      ...(lowStock && {
        inventory: {
          some: {
            branchId: branchId || null,
            currentStock: { lte: 10 } // Fallback for simple low stock check
          }
        }
      })
    };

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          manufacturer: { select: { id: true, name: true } },
          inventory: branchId ? { where: { branchId } } : true,
          inventoryBatches: {
            where: { branchId: branchId || null, deletedAt: null },
            orderBy: { expiryDate: 'asc' }
          }
        },
        orderBy: { [sortBy || 'name']: order || 'asc' },
        skip,
        take,
      }),
      prisma.medicine.count({ where }),
    ]);

    // Flatten for compatibility with legacy UI
    const formattedMedicines = medicines.map(m => {
      const inv = m.inventory?.[0] || {};
      const latestBatch = m.inventoryBatches?.[0] || {};
      return {
        ...m,
        stock: inv.currentStock || 0,
        availableStock: (inv.currentStock || 0) - (inv.reservedStock || 0),
        reorderLevel: inv.reorderPoint || m.reorderLevel || 10,
        rackLocation: inv.rackLocation || null,
        batchNumber: latestBatch.batchNumber || null,
        expiryDate: latestBatch.expiryDate || null,
        mrp: latestBatch.mrp || 0,
        purchasePrice: latestBatch.purchasePrice || 0,
      };
    });

    return {
      medicines: formattedMedicines,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findById(id, tenantId, branchId = null) {
    const medicine = await prisma.medicine.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        manufacturer: true,
        pricingMaster: {
          where: { isActive: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        interactions: {
          include: {
            interactsWith: {
              select: { id: true, name: true, genericName: true },
            },
          },
        },
        alternatives: {
          include: {
            alternative: {
              select: { id: true, name: true, genericName: true, strength: true },
            },
          },
          orderBy: { matchScore: 'desc' },
        },
        inventory: {
          where: { branchId }
        },
        inventoryBatches: {
          where: { branchId, deletedAt: null, quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' }
        },
      },
    });

    if (!medicine) return null;

    const inv = medicine.inventory?.[0] || {};
    const latestBatch = medicine.inventoryBatches?.[0] || {};

    return {
      ...medicine,
      stock: inv.currentStock || 0,
      availableStock: (inv.currentStock || 0) - (inv.reservedStock || 0),
      reorderLevel: inv.reorderPoint || medicine.reorderLevel || 10,
      rackLocation: inv.rackLocation || null,
      batchNumber: latestBatch.batchNumber || null,
      expiryDate: latestBatch.expiryDate || null,
      mrp: latestBatch.mrp || 0,
      purchasePrice: latestBatch.purchasePrice || 0,
    };
  }

  async create(data) {
    return await prisma.medicine.create({
      data,
      include: {
        category: true,
        manufacturer: true
      }
    });
  }

  async update(id, tenantId, data, tx = null) {
    const db = tx || prisma;
    const { rackLocation, ...medicineData } = data;

    if (rackLocation !== undefined) {
      await db.inventory.updateMany({
        where: { tenantId, medicineId: id },
        data: { rackLocation }
      });
    }

    return await db.medicine.update({
      where: { id, tenantId },
      data: medicineData,
      include: {
        category: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } }
      }
    });
  }

  async softDelete(id, tenantId, tx = null) {
    const db = tx || prisma;
    return await db.medicine.update({
      where: { id, tenantId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async deleteAll(tenantId) {
    return await prisma.medicine.updateMany({
      where: { tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async findByBarcode(barcode, tenantId, branchId = null) {
    const medicine = await prisma.medicine.findFirst({
      where: { barcode, tenantId, deletedAt: null },
      include: {
        inventory: {
          where: { branchId }
        },
        inventoryBatches: {
          where: { branchId, deletedAt: null, quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
          orderBy: { expiryDate: 'asc' }
        },
      },
    });

    if (!medicine) return null;

    const inv = medicine.inventory?.[0] || {};
    return {
      ...medicine,
      currentStock: inv.currentStock || 0,
      availableStock: (inv.currentStock || 0) - (inv.reservedStock || 0)
    };
  }

  async flagBatchRecall(batchNumber, tenantId) {
    return await prisma.inventoryBatch.updateMany({
      where: {
        batchNumber,
        medicine: { tenantId }
      },
      data: { 
        recalled: true,
        status: 'RECALLED'
      }
    });
  }
}

export default new MedicineRepository();
