import prisma from '../../../config/prisma.js';

class BatchRepository {
  async findAll({
    tenantId,
    status,
    branchId,
    supplierId,
    medicineId,
    expiryBefore,
    expiryAfter,
    sortBy,
    order,
    skip,
    take,
  }) {
    const where = {
      deletedAt: null,
      medicine: { tenantId },
      ...(status && { status }),
      ...(branchId && { branchId }),
      ...(supplierId && { supplierId }),
      ...(medicineId && { medicineId }),
      ...((expiryBefore || expiryAfter) && {
        expiryDate: {
          ...(expiryBefore && { lte: new Date(expiryBefore) }),
          ...(expiryAfter && { gte: new Date(expiryAfter) }),
        },
      }),
    };

    const [batches, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        include: {
          medicine: {
            select: { id: true, name: true, genericName: true, dosageForm: true, strength: true },
          },
          branch: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { [sortBy || 'expiryDate']: order || 'asc' },
        skip: skip || 0,
        take: take || 20,
      }),
      prisma.inventoryBatch.count({ where }),
    ]);

    return { batches, total };
  }

  async findById(id) {
    return prisma.inventoryBatch.findFirst({
      where: { id, deletedAt: null },
      include: {
        medicine: { include: { category: true, manufacturer: true } },
        branch: true,
        supplier: true,
        quarantineRecords: true,
      },
    });
  }

  async findByMedicineId(medicineId) {
    return prisma.inventoryBatch.findMany({
      where: { medicineId, deletedAt: null },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async create(data) {
    return prisma.inventoryBatch.create({
      data: {
        ...data,
        expiryDate: new Date(data.expiryDate),
        manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : null,
      },
      include: {
        medicine: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async update(id, data) {
    const updateData = { ...data };
    if (updateData.expiryDate) updateData.expiryDate = new Date(updateData.expiryDate);
    if (updateData.manufacturingDate)
      updateData.manufacturingDate = new Date(updateData.manufacturingDate);

    return prisma.inventoryBatch.update({
      where: { id },
      data: updateData,
    });
  }

  async softDelete(id) {
    return prisma.inventoryBatch.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        deletedAt: new Date(),
      },
    });
  }

  async findByBatchNumber(batchNumber, tenantId) {
    return prisma.inventoryBatch.findFirst({
      where: {
        batchNumber,
        medicine: { tenantId },
        deletedAt: null,
      },
    });
  }

  async getFefoBatches(medicineId, quantity) {
    const now = new Date();
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        medicineId,
        deletedAt: null,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
        expiryDate: { gt: now },
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (quantity === undefined) return batches;

    const selected = [];
    let remaining = quantity;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const taken = Math.min(batch.availableQuantity, remaining);
      selected.push({ ...batch, taken });
      remaining -= taken;
    }

    return {
      batches: selected,
      fulfilled: remaining <= 0,
      shortQuantity: remaining > 0 ? remaining : 0,
    };
  }

  async findExpiringBatches(tenantId, thresholdDate) {
    return prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        expiryDate: { lte: thresholdDate, gt: new Date() },
        availableQuantity: { gt: 0 },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findExpiredBatches(tenantId, currentDate) {
    return prisma.inventoryBatch.findMany({
      where: {
        medicine: { tenantId },
        OR: [{ expiryDate: { lt: currentDate } }, { status: 'EXPIRED' }],
        quantity: { gt: 0 },
        deletedAt: null,
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async quarantine(id, reason, userId) {
    const batch = await prisma.inventoryBatch.update({
      where: { id },
      data: { status: 'QUARANTINED' },
    });

    await prisma.quarantinedBatch.create({
      data: {
        batchId: id,
        reason,
        quarantinedBy: userId,
      },
    });

    return batch;
  }

  async recall(id) {
    return prisma.inventoryBatch.update({
      where: { id },
      data: {
        status: 'RECALLED',
        recalled: true,
      },
    });
  }

  async releaseQuarantine(id) {
    return prisma.inventoryBatch.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });
  }

  async findQuarantined(tenantId) {
    return prisma.inventoryBatch.findMany({
      where: {
        status: 'QUARANTINED',
        deletedAt: null,
        medicine: { tenantId },
      },
      include: {
        medicine: { select: { id: true, name: true } },
        quarantineRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  /**
   * Trace a batch to all invoices and patients
   */
  async getTraceability(batchId) {
    return prisma.invoiceItem.findMany({
      where: { batchId },
      include: {
        invoice: {
          include: {
            patient: {
              select: { id: true, fullName: true, phone: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new BatchRepository();
