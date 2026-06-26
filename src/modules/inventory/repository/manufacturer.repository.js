import prisma from '../../../config/prisma.js';

class ManufacturerRepository {
  async findAll(tenantId) {
    return prisma.manufacturer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.manufacturer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async create(data, options = {}) {
    return prisma.manufacturer.create({
      data,
      ...options,
    });
  }

  async update(id, tenantId, data, options = {}) {
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data,
      ...options,
    });
  }

  async delete(id, tenantId, options = {}) {
    const { select } = options;
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
      ...(select ? { select } : { select: { id: true } }),
    });
  }
}

export default new ManufacturerRepository();
