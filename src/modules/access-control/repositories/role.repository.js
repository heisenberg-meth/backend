import prisma from '../../../config/prisma.js';

class RoleRepository {
  async findAll(tenantId) {
    return prisma.accessRole.findMany({
      where: { tenantId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findById(id, tenantId) {
    return prisma.accessRole.findFirst({
      where: { id, tenantId },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async create(data) {
    return prisma.accessRole.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        permissions: {
          create: data.permissions?.map((pId) => ({
            permissionId: pId,
          })),
        },
      },
      include: {
        permissions: true,
      },
    });
  }

  async update(id, tenantId, data) {
    return prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id, tenantId },
        data: {
          name: data.name,
          description: data.description,
        },
      });

      if (data.permissions) {
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        });

        await tx.rolePermission.createMany({
          data: data.permissions.map((pId) => ({
            roleId: id,
            permissionId: pId,
          })),
        });
      }

      return role;
    });
  }

  async findByName(name, tenantId) {
    return prisma.accessRole.findUnique({
      where: {
        tenantId_name: {
          tenantId,
          name,
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }
}

export default new RoleRepository();
