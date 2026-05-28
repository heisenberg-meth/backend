import prisma from "../../../config/prisma.js";

class BranchRepository {
  async findAll(tenantId) {
    return prisma.branch.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.branch.findFirst({
      where: { id, tenantId },
    });
  }

  async findByCode(code, tenantId) {
    return prisma.branch.findFirst({
      where: { code, tenantId },
    });
  }

  async create(data) {
    return prisma.branch.create({
      data,
    });
  }

  async update(id, tenantId, data) {
    return prisma.branch.update({
      where: { id, tenantId },
      data,
    });
  }
}

export default new BranchRepository();
