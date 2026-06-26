import prisma from '../../../config/prisma.js';

class CategoryRepository {
  async findAll(tenantId) {
    return prisma.medicineCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.medicineCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async create(data, options = {}) {
    return prisma.medicineCategory.create({
      data,
      ...options,
    });
  }

  async update(id, tenantId, data, options = {}) {
    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data,
      ...options,
    });
  }

  async delete(id, tenantId, options = {}) {
    const { select } = options;
    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
      ...(select ? { select } : { select: { id: true } }),
    });
  }
}

export default new CategoryRepository();
