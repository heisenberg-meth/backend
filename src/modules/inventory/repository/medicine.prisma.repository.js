import prisma from '../../../config/prisma.js';
import { Prisma } from '@prisma/client';

const ALLOWED_SORT_COLUMNS = new Set([
  'name',
  'genericName',
  'createdAt',
  'updatedAt',
  'reorderLevel',
  'hsnCode',
  'category',
  'manufacturer',
  'mrp',
  'sellingPrice',
]);

class MedicinePrismaRepository {
  async findAll({
    tenantId,
    branchId,
    search,
    categoryId,
    status,
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

    const targetBranchId = branchId === 'null' || !branchId ? undefined : branchId;

    let medicines = [];
    let total = 0;

    if (lowStock || status) {
      const upperStatus = status ? status.toUpperCase().replace(' ', '_') : null;
      const bCond = targetBranchId
        ? Prisma.sql`AND ib."branchId" = ${targetBranchId}`
        : Prisma.sql``;

      const baseFilterQuery = Prisma.sql`
        WITH batch_aggregates AS (
          SELECT 
            ib."medicineId",
            SUM(ib."availableQuantity") as current_stock,
            MIN(ib."expiryDate") as next_expiry
          FROM "InventoryBatch" ib
          WHERE ib."tenantId" = ${tenantId}
            AND ib."deletedAt" IS NULL
          ${bCond}
          GROUP BY ib."medicineId"
        ),
        inventory_aggregates AS (
          SELECT
            i."medicineId",
            MAX(i."reorderPoint") as max_reorder_point
          FROM "Inventory" i
          WHERE i."tenantId" = ${tenantId}
          ${targetBranchId ? Prisma.sql`AND i."branchId" = ${targetBranchId}` : Prisma.sql``}
          GROUP BY i."medicineId"
        )
        SELECT m."id"
        FROM "Medicine" m
        LEFT JOIN batch_aggregates ba ON m."id" = ba."medicineId"
        LEFT JOIN inventory_aggregates ia ON m."id" = ia."medicineId"
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
          ${isActive !== undefined ? Prisma.sql`AND m."isActive" = ${isActive}` : Prisma.sql``}
          ${categoryId ? Prisma.sql`AND m."categoryId" = ${categoryId}` : Prisma.sql``}
          ${manufacturerId ? Prisma.sql`AND m."manufacturerId" = ${manufacturerId}` : Prisma.sql``}
          ${search ? Prisma.sql`AND (m."name" ILIKE ${'%' + search + '%'} OR m."genericName" ILIKE ${'%' + search + '%'} OR m."barcode" ILIKE ${'%' + search + '%'} OR m."sku" ILIKE ${'%' + search + '%'})` : Prisma.sql``}
          ${upperStatus === 'IN_STOCK' ? Prisma.sql`AND COALESCE(ba.current_stock, 0) > COALESCE(ia.max_reorder_point, m."reorderLevel", 10)` : Prisma.sql``}
          ${upperStatus === 'LOW_STOCK' || lowStock ? Prisma.sql`AND COALESCE(ba.current_stock, 0) > 0 AND COALESCE(ba.current_stock, 0) <= COALESCE(ia.max_reorder_point, m."reorderLevel", 10)` : Prisma.sql``}
          ${upperStatus === 'OUT_OF_STOCK' ? Prisma.sql`AND COALESCE(ba.current_stock, 0) <= 0` : Prisma.sql``}
          ${upperStatus === 'EXPIRING_SOON' ? Prisma.sql`AND ba.next_expiry > NOW() AND ba.next_expiry <= (NOW() + INTERVAL '30 days')` : Prisma.sql``}
          ${upperStatus === 'EXPIRED' ? Prisma.sql`AND ba.next_expiry <= NOW()` : Prisma.sql``}
        ORDER BY m.${Prisma.raw(`"${ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'name'}"`)} ${order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`}
      `;

      const countQuery = Prisma.sql`
        WITH batch_aggregates AS (
          SELECT 
            ib."medicineId",
            SUM(ib."availableQuantity") as current_stock,
            MIN(ib."expiryDate") as next_expiry
          FROM "InventoryBatch" ib
          WHERE ib."tenantId" = ${tenantId}
            AND ib."deletedAt" IS NULL
          ${bCond}
          GROUP BY ib."medicineId"
        ),
        inventory_aggregates AS (
          SELECT
            i."medicineId",
            MAX(i."reorderPoint") as max_reorder_point
          FROM "Inventory" i
          WHERE i."tenantId" = ${tenantId}
          ${targetBranchId ? Prisma.sql`AND i."branchId" = ${targetBranchId}` : Prisma.sql``}
          GROUP BY i."medicineId"
        )
        SELECT COUNT(m."id") as count
        FROM "Medicine" m
        LEFT JOIN batch_aggregates ba ON m."id" = ba."medicineId"
        LEFT JOIN inventory_aggregates ia ON m."id" = ia."medicineId"
        WHERE m."tenantId" = ${tenantId}
          AND m."deletedAt" IS NULL
          ${isActive !== undefined ? Prisma.sql`AND m."isActive" = ${isActive}` : Prisma.sql``}
          ${categoryId ? Prisma.sql`AND m."categoryId" = ${categoryId}` : Prisma.sql``}
          ${manufacturerId ? Prisma.sql`AND m."manufacturerId" = ${manufacturerId}` : Prisma.sql``}
          ${search ? Prisma.sql`AND (m."name" ILIKE ${'%' + search + '%'} OR m."genericName" ILIKE ${'%' + search + '%'} OR m."barcode" ILIKE ${'%' + search + '%'} OR m."sku" ILIKE ${'%' + search + '%'})` : Prisma.sql``}
          ${upperStatus === 'IN_STOCK' ? Prisma.sql`AND COALESCE(ba.current_stock, 0) > COALESCE(ia.max_reorder_point, m."reorderLevel", 10)` : Prisma.sql``}
          ${upperStatus === 'LOW_STOCK' || lowStock ? Prisma.sql`AND COALESCE(ba.current_stock, 0) > 0 AND COALESCE(ba.current_stock, 0) <= COALESCE(ia.max_reorder_point, m."reorderLevel", 10)` : Prisma.sql``}
          ${upperStatus === 'OUT_OF_STOCK' ? Prisma.sql`AND COALESCE(ba.current_stock, 0) <= 0` : Prisma.sql``}
          ${upperStatus === 'EXPIRING_SOON' ? Prisma.sql`AND ba.next_expiry > NOW() AND ba.next_expiry <= (NOW() + INTERVAL '30 days')` : Prisma.sql``}
          ${upperStatus === 'EXPIRED' ? Prisma.sql`AND ba.next_expiry <= NOW()` : Prisma.sql``}
      `;

      const countResult = await prisma.$queryRaw(countQuery);
      total = Number(countResult[0]?.count || 0);

      const paginatedIdsQuery = Prisma.sql`
        ${baseFilterQuery}
        LIMIT ${take || 20} OFFSET ${skip || 0}
      `;

      const paginatedResult = await prisma.$queryRaw(paginatedIdsQuery);
      const paginatedIds = paginatedResult.map((r) => r.id);

      if (paginatedIds.length === 0) {
        medicines = [];
      } else {
        medicines = await prisma.medicine.findMany({
          where: { id: { in: paginatedIds } },
          include: {
            category: true,
            manufacturer: true,
            supplier: { select: { id: true, name: true } },
            inventory: {
              where: targetBranchId ? { branchId: targetBranchId } : {},
            },
            inventoryBatches: {
              where: { ...(targetBranchId ? { branchId: targetBranchId } : {}), deletedAt: null },
              orderBy: { expiryDate: 'asc' },
              select: {
                id: true,
                batchNumber: true,
                quantity: true,
                availableQuantity: true,
                reservedQuantity: true,
                expiryDate: true,
                sellingPrice: true,
                mrp: true,
                purchasePrice: true,
                status: true,
                branchId: true,
              },
            },
          },
        });

        // Re-sort correctly based on raw SQL IDs to preserve ordering
        const sortMap = new Map(paginatedIds.map((id, index) => [id, index]));
        medicines.sort((a, b) => sortMap.get(a.id) - sortMap.get(b.id));
      }
    } else {
      const results = await Promise.all([
        prisma.medicine.findMany({
          where: baseWhere,
          include: {
            category: true,
            manufacturer: true,
            supplier: { select: { id: true, name: true } },
            inventory: {
              where: targetBranchId ? { branchId: targetBranchId } : {},
            },
            inventoryBatches: {
              where: { ...(targetBranchId ? { branchId: targetBranchId } : {}), deletedAt: null },
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
      // ── FEFO: first non-empty, non-expired, active batch (ground truth)
      const now = new Date();
      const activeBatches = (m.inventoryBatches || []).filter(
        (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
      );
      const fefo = activeBatches[0] || null;

      // ── Compute available stock from InventoryBatch (authoritative source)
      const batchAvailableStock = activeBatches.reduce(
        (sum, b) => sum + (b.availableQuantity || 0),
        0,
      );

      // Use authoritative stock source
      let stock = batchAvailableStock || 0;
      let reservedStock = 0;
      let reorderLevel = m.reorderLevel ?? 10;
      let rackLocation = null;
      let status = 'HEALTHY';

      if (targetBranchId) {
        const inv = m.inventory?.[0] || null;
        reservedStock = inv?.reservedStock ?? 0;
        reorderLevel = inv?.reorderPoint ?? m.reorderLevel ?? 10;
        rackLocation = inv?.rackLocation ?? null;
        status = inv?.status ?? 'HEALTHY';
      } else {
        reservedStock = m.inventory?.reduce((sum, inv) => sum + (inv.reservedStock ?? 0), 0) ?? 0;
        reorderLevel =
          m.inventory && m.inventory.length > 0
            ? Math.max(...m.inventory.map((inv) => inv.reorderPoint ?? 0), m.reorderLevel ?? 10)
            : (m.reorderLevel ?? 10);
        rackLocation =
          m.inventory
            ?.map((inv) => inv.rackLocation)
            .filter(Boolean)
            .join(', ') || null;
        status = m.inventory?.some((inv) => inv.status === 'CRITICAL') ? 'CRITICAL' : 'HEALTHY';
      }

      const availableStock = batchAvailableStock;
      const toNum = (val) => (val ? Number(val) : 0);

      return {
        ...m,
        supplierId: m.supplierId,
        supplier: m.supplier,
        stock,
        availableStock,
        reservedStock,
        reorderLevel,
        rackLocation,
        status,
        isOutOfStock: availableStock <= 0,

        // FEFO batch fields — only from a batch with actual stock
        batchId: fefo?.id ?? null,
        batchNumber: fefo?.batchNumber ?? null,
        expiryDate: fefo?.expiryDate ?? null,
        mrp: toNum(fefo?.mrp),
        purchasePrice: toNum(fefo?.purchasePrice),

        // Backward compatibility
        currentStock: stock,
        reorderPoint: reorderLevel,
      };
    });

    return { medicines: formattedMedicines, total };
  }

  async findById(id, tenantId, branchId = null) {
    const targetBranchId = branchId === 'null' || !branchId ? undefined : branchId;

    const medicine = await prisma.medicine.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        manufacturer: true,
        supplier: { select: { id: true, name: true } },
        inventory: {
          where: targetBranchId ? { branchId: targetBranchId } : {},
        },
        inventoryBatches: {
          where: { ...(targetBranchId ? { branchId: targetBranchId } : {}), deletedAt: null },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!medicine) return null;

    const now = new Date();
    const activeBatches = (medicine.inventoryBatches || []).filter(
      (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
    );
    const fefo = activeBatches[0] || null;

    // Compute from batches (ground truth)
    const batchAvailableStock = activeBatches.reduce(
      (sum, b) => sum + (b.availableQuantity || 0),
      0,
    );

    let stock = batchAvailableStock || 0;
    let reservedStock = 0;
    let reorderLevel = medicine.reorderLevel ?? 10;
    let rackLocation = null;
    let status = 'HEALTHY';

    if (targetBranchId) {
      const inv = medicine.inventory?.[0] || null;
      reservedStock = inv?.reservedStock ?? 0;
      reorderLevel = inv?.reorderPoint ?? medicine.reorderLevel ?? 10;
      rackLocation = inv?.rackLocation ?? null;
      status = inv?.status ?? 'HEALTHY';
    } else {
      reservedStock =
        medicine.inventory?.reduce((sum, inv) => sum + (inv.reservedStock ?? 0), 0) ?? 0;
      reorderLevel =
        medicine.inventory && medicine.inventory.length > 0
          ? Math.max(
              ...medicine.inventory.map((inv) => inv.reorderPoint ?? 0),
              medicine.reorderLevel ?? 10,
            )
          : (medicine.reorderLevel ?? 10);
      rackLocation =
        medicine.inventory
          ?.map((inv) => inv.rackLocation)
          .filter(Boolean)
          .join(', ') || null;
      status = medicine.inventory?.some((inv) => inv.status === 'CRITICAL')
        ? 'CRITICAL'
        : 'HEALTHY';
    }

    return {
      ...medicine,
      supplierId: medicine.supplierId,
      supplier: medicine.supplier,
      stock,
      availableStock: batchAvailableStock,
      reservedStock,
      reorderLevel,
      rackLocation,
      status,
      isOutOfStock: batchAvailableStock <= 0,

      // FEFO batch (only a batch with actual stock)
      batchId: fefo?.id || null,
      batchNumber: fefo?.batchNumber || null,
      expiryDate: fefo?.expiryDate || null,
      mrp: fefo?.mrp || 0,
      purchasePrice: fefo?.purchasePrice || 0,

      // Legacy compatibility
      currentStock: stock,
      reorderPoint: reorderLevel,
    };
  }

  async create(data, tx = prisma, options = {}) {
    const { select, include } = options;
    return tx.medicine.create({
      data,
      ...(select
        ? { select }
        : {
            include: include || {
              category: true,
              manufacturer: true,
              supplier: { select: { id: true, name: true } },
            },
          }),
    });
  }

  async update(id, tenantId, data, options = {}) {
    const { rackLocation, ...medicineData } = data;
    const { select, include } = options;

    if (rackLocation !== undefined) {
      await prisma.inventory.updateMany({
        where: { tenantId, medicineId: id },
        data: { rackLocation },
      });
    }

    return prisma.medicine.update({
      where: { id, tenantId },
      data: medicineData,
      ...(select
        ? { select }
        : {
            include: include || {
              category: true,
              manufacturer: true,
              supplier: { select: { id: true, name: true } },
            },
          }),
    });
  }

  async delete(id, tenantId, options = {}) {
    const { select } = options;
    return prisma.medicine.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
      ...(select ? { select } : { select: { id: true } }),
    });
  }

  async deleteAll(tenantId) {
    return prisma.medicine.updateMany({
      where: { tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async findByBarcode(barcode, tenantId, branchId = null) {
    const targetBranchId = branchId === 'null' || !branchId ? undefined : branchId;

    const medicine = await prisma.medicine.findFirst({
      where: { barcode, tenantId, deletedAt: null },
      include: {
        inventory: {
          where: targetBranchId ? { branchId: targetBranchId } : {},
        },
        inventoryBatches: {
          where: { ...(targetBranchId ? { branchId: targetBranchId } : {}), deletedAt: null },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!medicine) return null;

    const now = new Date();
    const activeBatches = (medicine.inventoryBatches || []).filter(
      (b) => b.availableQuantity > 0 && b.status === 'ACTIVE' && new Date(b.expiryDate) > now,
    );
    const batchAvailableStock = activeBatches.reduce(
      (sum, b) => sum + (b.availableQuantity || 0),
      0,
    );

    let reservedStock = 0;

    if (targetBranchId) {
      const inv = medicine.inventory?.[0] || null;
      reservedStock = inv?.reservedStock ?? 0;
    } else {
      reservedStock =
        medicine.inventory?.reduce((sum, inv) => sum + (inv.reservedStock ?? 0), 0) ?? 0;
    }

    return {
      ...medicine,
      currentStock: batchAvailableStock,
      availableStock: batchAvailableStock,
      reservedStock,
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
