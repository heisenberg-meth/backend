import prisma from '../../../config/prisma.js';

class ManufacturerRepository {
  async findAll(tenantId) {
    return prisma.manufacturer.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: { select: { medicines: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.manufacturer.findFirst({
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
