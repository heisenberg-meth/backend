import prisma from "../../../config/prisma.js";

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

  async create(data) {
    return prisma.medicineCategory.create({
      data,
    });
  }

  async update(id, tenantId, data) {
    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data,
    });
  }

  async delete(id, tenantId) {
    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }
}

export default new CategoryRepository();
