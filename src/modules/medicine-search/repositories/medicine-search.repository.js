import prisma from '../../../config/prisma.js';

class MedicineSearchRepository {
  async search(tenantId, query, options = {}) {
    const { limit = 20, category, schedule, branchId, inStockOnly = false } = options;

    const where = {
      tenantId,
      isActive: true,
      deletedAt: null,
    };

    if (category) {
      where.categoryId = category;
    }

    if (schedule) {
      where.scheduleType = schedule;
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { genericName: { contains: query, mode: 'insensitive' } },
        { composition: { contains: query, mode: 'insensitive' } },
        { barcode: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { strength: { contains: query, mode: 'insensitive' } },
      ];
    }

    const medicines = await prisma.medicine.findMany({
      where,
      include: {
        category: { select: { name: true } },
        manufacturer: { select: { name: true } },
        inventoryBatches: {
          where: {
            deletedAt: null,
            status: 'ACTIVE',
            ...(branchId ? { branchId } : {}),
          },
          select: {
            id: true,
            quantity: true,
            reservedQuantity: true,
            expiryDate: true,
            sellingPrice: true,
            mrp: true,
            branchId: true,
          },
          orderBy: { expiryDate: 'asc' },
        },
      },
      take: limit,
    });

    return medicines.map((med) => this.enrichWithInventory(med, inStockOnly));
  }

  async autocomplete(tenantId, prefix, limit = 10) {
    if (!prefix || prefix.length < 2) return [];

    const medicines = await prisma.medicine.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        OR: [
          { name: { startsWith: prefix, mode: 'insensitive' } },
          { genericName: { startsWith: prefix, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        genericName: true,
        strength: true,
        dosageForm: true,
        scheduleType: true,
        prescriptionRequired: true,
      },
      orderBy: [{ name: 'asc' }],
      take: limit,
    });

    return medicines;
  }

  async fuzzySearch(tenantId, query, limit = 20) {
    const results = await prisma.$queryRaw`
      SELECT
        m.id,
        m.name,
        m."genericName",
        m.strength,
        m."dosageForm",
        m."scheduleType",
        m."prescriptionRequired",
        m.barcode,
        m.sku,
        m."isActive",
        m."gstPercentage",
        m."unitPrice",
        m."sellingPrice",
        c.name as "categoryName",
        mf.name as "manufacturerName",
        GREATEST(
          similarity(m.name, ${query}),
          similarity(m."genericName", ${query}),
          similarity(m.composition, ${query}),
          similarity(m.strength, ${query})
        ) as similarity_score
      FROM "Medicine" m
      LEFT JOIN "MedicineCategory" c ON m."categoryId" = c.id
      LEFT JOIN "Manufacturer" mf ON m."manufacturerId" = mf.id
      WHERE m."tenantId" = ${tenantId}
        AND m."isActive" = true
        AND m."deletedAt" IS NULL
        AND (
          m.name % ${query}
          OR m."genericName" % ${query}
          OR m.composition % ${query}
          OR m.strength % ${query}
        )
      ORDER BY similarity_score DESC
      LIMIT ${limit}
    `;

    return results;
  }

  async findByBarcode(barcode, tenantId) {
    return prisma.medicine.findFirst({
      where: {
        tenantId,
        barcode,
        isActive: true,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        manufacturer: { select: { name: true } },
        inventoryBatches: {
          where: {
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            batchNumber: true,
            quantity: true,
            reservedQuantity: true,
            expiryDate: true,
            sellingPrice: true,
            mrp: true,
            branchId: true,
            barcode: true,
          },
        },
      },
    });
  }

  async findByBarcodeMapping(barcode, tenantId) {
    const mapping = await prisma.medicineBarcode.findFirst({
      where: {
        tenantId,
        barcode,
      },
      include: {
        medicine: {
          include: {
            inventoryBatches: {
              where: {
                deletedAt: null,
                status: 'ACTIVE',
                ...(mapping?.batchId ? { id: mapping.batchId } : {}),
              },
              select: {
                id: true,
                batchNumber: true,
                quantity: true,
                reservedQuantity: true,
                expiryDate: true,
                sellingPrice: true,
                mrp: true,
                branchId: true,
              },
            },
          },
        },
      },
    });

    return mapping?.medicine || null;
  }

  async findBySku(sku, tenantId) {
    return prisma.medicine.findFirst({
      where: {
        tenantId,
        sku,
        isActive: true,
        deletedAt: null,
      },
      include: {
        category: { select: { name: true } },
        manufacturer: { select: { name: true } },
        inventoryBatches: {
          where: {
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            batchNumber: true,
            quantity: true,
            reservedQuantity: true,
            expiryDate: true,
            sellingPrice: true,
            mrp: true,
            branchId: true,
          },
        },
      },
    });
  }

  async findAlternatives(medicineId, tenantId, limit = 10) {
    const alternatives = await prisma.drugAlternative.findMany({
      where: {
        medicineId,
        alternative: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
      },
      include: {
        alternative: {
          include: {
            category: { select: { name: true } },
            manufacturer: { select: { name: true } },
            inventoryBatches: {
              where: { deletedAt: null, status: 'ACTIVE' },
              select: {
                quantity: true,
                reservedQuantity: true,
                expiryDate: true,
                sellingPrice: true,
              },
              take: 1,
            },
          },
        },
      },
      take: limit,
    });

    return alternatives.map((a) => a.alternative);
  }

  async getAvailability(medicineId, tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicineId,
        tenantId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: {
        branch: { select: { name: true, code: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    return batches.map((batch) => ({
      branchId: batch.branchId,
      branchName: batch.branch?.name,
      branchCode: batch.branch?.code,
      batchNumber: batch.batchNumber,
      availableStock: batch.quantity - batch.reservedQuantity,
      totalStock: batch.quantity,
      reservedStock: batch.reservedQuantity,
      expiryDate: batch.expiryDate,
      sellingPrice: batch.sellingPrice,
      mrp: batch.mrp,
      isNearExpiry: this.isNearExpiry(batch.expiryDate),
      isExpired: new Date(batch.expiryDate) < new Date(),
    }));
  }

  async getPopularSearches(tenantId, limit = 20) {
    const searches = await prisma.$queryRaw`
      SELECT query, COUNT(*) as count
      FROM "SearchAnalytics"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" > NOW() - INTERVAL '7 days'
      GROUP BY query
      ORDER BY count DESC
      LIMIT ${limit}
    `;

    return searches;
  }

  async getFailedSearches(tenantId, limit = 20) {
    return prisma.searchAnalytics.findMany({
      where: {
        tenantId,
        resultCount: 0,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        query: true,
        count: true,
        createdAt: true,
      },
    });
  }

  enrichWithInventory(medicine, inStockOnly = false) {
    const batches = medicine.inventoryBatches || [];
    const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);
    const reservedStock = batches.reduce((sum, b) => sum + (b.reservedQuantity || 0), 0);
    const availableStock = totalStock - reservedStock;

    const earliestExpiry =
      batches.length > 0
        ? batches.reduce(
            (earliest, b) => (b.expiryDate < earliest ? b.expiryDate : earliest),
            batches[0].expiryDate,
          )
        : null;

    const isNearExpiry = earliestExpiry ? this.isNearExpiry(earliestExpiry) : false;
    const isExpired = earliestExpiry ? new Date(earliestExpiry) < new Date() : false;

    const bestPrice =
      batches.length > 0 ? Math.min(...batches.map((b) => b.sellingPrice)) : medicine.sellingPrice;

    const bestMrp = batches.length > 0 ? Math.max(...batches.map((b) => b.mrp)) : null;

    const result = {
      id: medicine.id,
      brandName: medicine.name,
      genericName: medicine.genericName,
      strength: medicine.strength,
      dosageForm: medicine.dosageForm,
      manufacturer: medicine.manufacturer?.name,
      category: medicine.category?.name,
      barcode: medicine.barcode,
      sku: medicine.sku,
      hsnCode: medicine.hsnCode,
      scheduleType: medicine.scheduleType,
      prescriptionRequired: medicine.prescriptionRequired,
      gstPercentage: medicine.gstPercentage,
      availableStock,
      totalStock,
      reservedStock,
      sellingPrice: bestPrice,
      mrp: bestMrp,
      unitPrice: medicine.unitPrice,
      earliestExpiry,
      isNearExpiry,
      isExpired,
      isActive: medicine.isActive,
      rackLocation: medicine.rackLocation,
      storageCondition: medicine.storageCondition,
      _score: medicine._score || undefined,
    };

    if (inStockOnly && availableStock <= 0) {
      return null;
    }

    return result;
  }

  isNearExpiry(expiryDate, daysThreshold = 90) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);
    return new Date(expiryDate) <= threshold;
  }
}

export default new MedicineSearchRepository();
