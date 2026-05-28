import prisma from "../../../config/prisma.js";
import { initRedis } from "../../../config/redis.js";

const redisClient = initRedis();

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

  async saveRefreshToken(token, userId, expiresAt) {
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    const key = `refresh_token:${token}`;
    await redisClient.set(key, userId, 'EX', ttlSeconds);
  }

  async findRefreshToken(token) {
    const key = `refresh_token:${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return null;
    return { userId, token };
  }

  async deleteRefreshToken(token) {
    const key = `refresh_token:${token}`;
    await redisClient.del(key);
  }

  async logRegistrationAttempt(ip, fingerprint) {
    return prisma.registrationAttempt.create({
      data: { ip, fingerprint },
    });
  }
}

export default new AuthPrismaRepository();
