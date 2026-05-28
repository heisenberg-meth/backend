import prisma from "../../../config/prisma.js";

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

  async create(data) {
    return prisma.manufacturer.create({
      data,
    });
  }

  async update(id, tenantId, data) {
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data,
    });
  }

  async delete(id, tenantId) {
    return prisma.manufacturer.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }
}

export default new ManufacturerRepository();
