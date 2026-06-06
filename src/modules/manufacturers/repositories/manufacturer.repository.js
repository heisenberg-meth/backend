import prisma from '../../../config/prisma.js';

class ManufacturerRepository {
  async findAll(tenantId) {
    const manufacturers = await prisma.manufacturer.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: { select: { medicines: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });

    return manufacturers.map((m) => ({
      ...m,
      medicineCount: m._count.medicines,
    }));
  }

  async findById(id, tenantId) {
    const manufacturer = await prisma.manufacturer.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { medicines: { where: { deletedAt: null } } } },
        medicines: {
          where: { deletedAt: null },
          take: 20,
          orderBy: { name: 'asc' },
          include: {
            inventoryBatches: {
              where: { deletedAt: null, status: 'ACTIVE' },
              select: { quantity: true },
            },
          },
        },
      },
    });

    if (!manufacturer) return null;

    return {
      ...manufacturer,
      medicineCount: manufacturer._count.medicines,
    };
  }

  async create(data) {
    return prisma.manufacturer.create({ data });
  }

  async update(id, tenantId, data) {
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data,
    });
  }

  async softDelete(id, tenantId) {
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }
}

export default new ManufacturerRepository();
