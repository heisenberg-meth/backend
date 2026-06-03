import prisma from '../../../config/prisma.js';

class MedicinePrismaRepository {
  async findAll({
    tenantId,
    branchId,
    search,
    categoryId,
    manufacturerId,
    isActive,
    lowStock,
    sortBy,
    order,
    skip,
    take,
  }) {
    const baseWhere = {
      tenantId,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { genericName: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(manufacturerId && { manufacturerId }),
      ...(isActive !== undefined && { isActive }),
    };

    let medicines = [];
    let total = 0;

    if (lowStock) {
      // Application-side filtering for lowStock because Prisma does not support comparing
      // currentStock <= reorderPoint in a where clause without raw SQL.
      const allMedicines = await prisma.medicine.findMany({
        where: baseWhere,
        include: {
          category: true,
          manufacturer: true,
          inventory: {
            where: { branchId: branchId || null },
          },
          inventoryBatches: {
            where: { branchId: branchId || null, deletedAt: null },
            orderBy: { expiryDate: 'asc' },
          },
        },
        orderBy: { [sortBy || 'name']: order || 'asc' },
      });

      const filtered = allMedicines.filter((m) => {
        const inv = m.inventory?.[0];
        const currentStock = inv?.currentStock ? Number(inv.currentStock) : 0;
        const reorderPt = inv?.reorderPoint
          ? Number(inv.reorderPoint)
          : m.reorderLevel
            ? Number(m.reorderLevel)
            : 10;
        return currentStock <= reorderPt;
      });

      total = filtered.length;
      medicines = filtered.slice(skip || 0, (skip || 0) + (take || 20));
    } else {
      const results = await Promise.all([
        prisma.medicine.findMany({
          where: baseWhere,
          include: {
            category: true,
            manufacturer: true,
            inventory: {
              where: { branchId: branchId || null },
            },
            inventoryBatches: {
              where: { branchId: branchId || null, deletedAt: null },
              orderBy: { expiryDate: 'asc' },
            },
          },
          orderBy: { [sortBy || 'name']: order || 'asc' },
          skip: skip || 0,
          take: take || 20,
        }),
        prisma.medicine.count({ where: baseWhere }),
      ]);
      medicines = results[0];
      total = results[1];
    }

    const formattedMedicines = medicines.map((m) => {
      const inv = m.inventory?.[0] || null;
      const latestBatch = m.inventoryBatches?.[0] || null;

      // Helper to safely convert Decimal to Number
      const toNum = (val) => (val ? Number(val) : 0);

      return {
        ...m,
        // Flat standard fields
        stock: inv?.currentStock ?? 0,
        availableStock: (inv?.currentStock ?? 0) - (inv?.reservedStock ?? 0),
        reservedStock: inv?.reservedStock ?? 0,
        reorderLevel: inv?.reorderPoint ?? m.reorderLevel ?? 10,
        rackLocation: inv?.rackLocation ?? null,
        status: inv?.status ?? 'HEALTHY',

        // Batch info - convert Decimal to Number for JSON serialization
        batchId: latestBatch?.id ?? null,
        batchNumber: latestBatch?.batchNumber ?? null,
        expiryDate: latestBatch?.expiryDate ?? null,
        mrp: toNum(latestBatch?.mrp),
        purchasePrice: toNum(latestBatch?.purchasePrice),

        // Backward compatibility
        currentStock: inv?.currentStock ?? 0,
        reorderPoint: inv?.reorderPoint ?? 10,
      };
    });

    return { medicines: formattedMedicines, total };
  }

  async findById(id, tenantId, branchId = null) {
    const medicine = await prisma.medicine.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        manufacturer: true,
        inventory: {
          where: { branchId },
        },
        inventoryBatches: {
          where: { branchId, deletedAt: null },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!medicine) return null;

    const inv = medicine.inventory[0];
    const latestBatch = medicine.inventoryBatches[0];
    return {
      ...medicine,
      // Flat standard fields for frontend
      stock: inv?.currentStock || 0,
      availableStock: (inv?.currentStock || 0) - (inv?.reservedStock || 0),
      reservedStock: inv?.reservedStock || 0,
      reorderLevel: inv?.reorderPoint || medicine.reorderLevel || 10,
      rackLocation: inv?.rackLocation || null,
      status: inv?.status || 'HEALTHY',

      // Latest batch info flattened
      batchId: latestBatch?.id || null,
      batchNumber: latestBatch?.batchNumber || null,
      expiryDate: latestBatch?.expiryDate || null,
      mrp: latestBatch?.mrp || 0,
      purchasePrice: latestBatch?.purchasePrice || 0,

      // Legacy compatibility
      currentStock: inv?.currentStock || 0,
      reorderPoint: inv?.reorderPoint || 10,
    };
  }

  async create(data, tx = prisma) {
    return tx.medicine.create({
      data,
      include: {
        category: true,
        manufacturer: true,
      },
    });
  }

  async update(id, tenantId, data) {
    const { rackLocation, ...medicineData } = data;

    if (rackLocation !== undefined) {
      await prisma.inventory.updateMany({
        where: { tenantId, medicineId: id },
        data: { rackLocation },
      });
    }

    return prisma.medicine.update({
      where: { id, tenantId },
      data: medicineData,
      include: {
        category: true,
        manufacturer: true,
      },
    });
  }

  async delete(id, tenantId) {
    return prisma.medicine.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  async deleteAll(tenantId) {
    return prisma.medicine.updateMany({
      where: { tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async findByBarcode(barcode, tenantId, branchId = null) {
    const medicine = await prisma.medicine.findFirst({
      where: { barcode, tenantId, deletedAt: null },
      include: {
        inventory: {
          where: { branchId },
        },
        inventoryBatches: {
          where: { branchId, deletedAt: null },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!medicine) return null;

    const inv = medicine.inventory[0];
    return {
      ...medicine,
      currentStock: inv?.currentStock || 0,
      availableStock: (inv?.currentStock || 0) - (inv?.reservedStock || 0),
    };
  }

  async flagBatchRecall(batchNumber, tenantId) {
    return prisma.inventoryBatch.updateMany({
      where: {
        batchNumber,
        medicine: { tenantId },
      },
      data: {
        recalled: true,
        status: 'RECALLED',
      },
    });
  }
}

export default new MedicinePrismaRepository();
