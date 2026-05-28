import prisma from "../../../config/prisma.js";

class AuthzService {
  async hasPermission(userId, permissionName, branchId = null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        assignedRole: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    if (!user.assignedRole) return false;
    if (user.assignedRole.name === 'ADMIN') return true;

    if (branchId && user.branchId && user.branchId !== branchId) {
      return false;
    }

    return user.assignedRole.permissions.some((rp) => rp.permission.name === permissionName);
  }

  async hasAnyPermission(userId, permissionNames) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        assignedRole: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    if (!user.assignedRole) return false;
    if (user.assignedRole.name === 'ADMIN') return true;

    return user.assignedRole.permissions.some((rp) => permissionNames.includes(rp.permission.name));
  }
}

export default new AuthzService();
