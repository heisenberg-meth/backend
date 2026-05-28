import prisma from "../../../config/prisma.js";

class PermissionRepository {
  async findAll() {
    return prisma.permission.findMany({
      orderBy: { module: 'asc' }
    });
  }

  async findById(id) {
    return prisma.permission.findUnique({
      where: { id }
    });
  }

  async findByNames(names) {
    return prisma.permission.findMany({
      where: {
        name: { in: names }
      }
    });
  }

  // Seeding helper
  async upsert(data) {
    return prisma.permission.upsert({
      where: { name: data.name },
      update: { module: data.module },
      create: data,
    });
  }
}

export default new PermissionRepository();
