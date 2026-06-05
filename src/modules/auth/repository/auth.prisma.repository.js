import prisma from '../../../config/prisma.js';

class AuthPrismaRepository {
  async findUserByEmail(email) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
      include: {
        tenant: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });
  }

  async findUserById(id) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        tenant: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });
  }

  async createUser(userData) {
    const email = userData.email.toLowerCase().trim();
    return prisma.user.create({
      data: {
        email,
        password: userData.password,
        fullName: userData.fullName,
        role: userData.role || 'OWNER',
        tenantId: userData.tenantId,
        branchId: userData.branchId,
      },
    });
  }

  async logRegistrationAttempt(ip, fingerprint) {
    return prisma.registrationAttempt.create({
      data: { ip, fingerprint },
    });
  }
}

export default new AuthPrismaRepository();
