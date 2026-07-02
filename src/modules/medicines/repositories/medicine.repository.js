import prisma from '../../../config/prisma.js';

class MedicineRepository {
  async findAll({
    tenantId,
    branchId,
    q,
    search,
    categoryId,
    manufacturerId,
    isActive,
    schedule,
    lowStock,
    sortBy,
    order,
    page = 1,
    limit = 50,
  }) {
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
            currentStock: { lte: 10 }, // Fallback for simple low stock check
          },
        },
      }),
    };

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          manufacturer: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          inventory: branchId ? { where: { branchId } } : true,
          inventoryBatches: {
            where: { branchId: branchId || null, deletedAt: null },
            orderBy: { expiryDate: 'asc' },
          },
        },
        orderBy: { [sortBy || 'name']: order || 'asc' },
        skip,
        take,
      }),
      prisma.medicine.count({ where }),
    ]);

    // Format medicines with stock summary
    const formattedMedicines = medicines.map((m) => {
      const now = new Date();
      const batches = m.inventoryBatches || [];
      const activeBatches = batches.filter(
        (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
      );
      const availableStock = activeBatches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
      const totalStock = availableStock;

      return {
        id: m.id,
        name: m.medicineName || m.name, // Legacy field for backward compatibility
        medicineName: m.medicineName || m.name,
        genericName: m.genericName,
        brandName: m.brandName,
        manufacturer: m.manufacturerName,
        medicineType: m.medicineType,
        dosageForm: m.dosageForm,
        strength: m.strength,
        gstPercentage: m.gstPercentage,
        status: m.status,
        isActive: m.isActive,
        totalStock,
        availableStock,
        batchCount: batches.length,
        category: m.category,
        supplierId: m.supplierId,
        supplier: m.supplier,
        createdAt: m.createdAt,
      };
    });

    return {
      items: formattedMedicines,
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
        category: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        pricingMaster: {
          where: { isActive: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
        interactions: {
          include: {
            interactsWith: {
              select: { id: true, medicineName: true, genericName: true },
            },
          },
        },
        alternatives: {
          include: {
            alternative: {
              select: { id: true, medicineName: true, genericName: true, strength: true },
            },
          },
          orderBy: { matchScore: 'desc' },
        },
        inventory: {
          where: branchId ? { branchId } : undefined,
        },
        inventoryBatches: {
          where: { deletedAt: null, quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
          include: {
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!medicine) return null;

    const now = new Date();
    const batches = medicine.inventoryBatches || [];
    const activeBatches = batches.filter(
      (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
    );
    const availableStock = activeBatches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
    const totalStock = availableStock;

    return {
      id: medicine.id,
      name: medicine.medicineName || medicine.name, // Legacy field for backward compatibility
      medicineName: medicine.medicineName || medicine.name,
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      manufacturer: medicine.manufacturerName,
      medicineType: medicine.medicineType,
      dosageForm: medicine.dosageForm,
      strength: medicine.strength,
      schedule: medicine.schedule,
      purchaseUnit: medicine.purchaseUnit,
      sellingUnit: medicine.sellingUnit,
      unitPerPack: medicine.unitPerPack,
      gstPercentage: medicine.gstPercentage,
      hsnCode: medicine.hsnCode,
      barcode: medicine.barcode,
      sku: medicine.sku,
      requiresPrescription: medicine.requiresPrescription,
      storageCondition: medicine.storageCondition,
      status: medicine.status,
      notes: medicine.notes,
      isActive: medicine.isActive,
      category: medicine.category,
      manufacturerData: medicine.manufacturer,
      supplierId: medicine.supplierId,
      supplier: medicine.supplier,
      createdAt: medicine.createdAt,
      updatedAt: medicine.updatedAt,
      batches: batches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        purchasePrice: Number(b.purchasePrice),
        mrp: Number(b.mrp),
        sellingPrice: Number(b.sellingPrice),
        availableQuantity: b.availableQuantity || b.quantity,
        quantity: b.quantity,
        rackLocation: b.rackLocation,
        supplier: b.supplier,
      })),
      inventorySummary: {
        totalStock,
        availableStock,
        batchCount: batches.length,
      },
      pricing: medicine.pricingMaster?.[0] || null,
      alternatives: medicine.alternatives?.map((a) => a.alternative) || [],
      interactions:
        medicine.interactions?.map((i) => ({
          medicine: i.interactsWith,
          severity: i.severity,
          description: i.description,
        })) || [],
    };
  }

  async create(data) {
    return await prisma.medicine.create({
      data,
      include: {
        category: true,
        manufacturer: true,
      },
    });
  }

  async update(id, tenantId, data, tx = null) {
    const db = tx || prisma;
    const { rackLocation, ...medicineData } = data;

    if (rackLocation !== undefined) {
      await db.inventory.updateMany({
        where: { tenantId, medicineId: id },
        data: { rackLocation },
      });
    }

    return await db.medicine.update({
      where: { id, tenantId },
      data: medicineData,
      include: {
        category: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
      },
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
        category: { select: { id: true, name: true } },
        inventory: {
          where: branchId ? { branchId } : undefined,
        },
        inventoryBatches: {
          where: { deletedAt: null, quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!medicine) return null;

    const now = new Date();
    const batches = medicine.inventoryBatches || [];
    const activeBatches = batches.filter(
      (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
    );
    const availableStock = activeBatches.reduce((sum, b) => sum + (b.availableQuantity || 0), 0);
    const totalStock = availableStock;

    return {
      id: medicine.id,
      name: medicine.medicineName || medicine.name, // Legacy field for backward compatibility
      medicineName: medicine.medicineName || medicine.name,
      genericName: medicine.genericName,
      brandName: medicine.brandName,
      manufacturer: medicine.manufacturerName,
      medicineType: medicine.medicineType,
      dosageForm: medicine.dosageForm,
      strength: medicine.strength,
      gstPercentage: medicine.gstPercentage,
      status: medicine.status,
      category: medicine.category,
      totalStock,
      availableStock,
      batchCount: batches.length,
    };
  }

  async flagBatchRecall(batchNumber, tenantId) {
    return await prisma.inventoryBatch.updateMany({
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

export default new MedicineRepository();
