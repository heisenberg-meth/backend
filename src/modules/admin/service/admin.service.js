import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../../config/prisma.js';
import { adminRepository } from '../repository/admin.repository.js';
import env from '../../../config/env.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

function generateTokens(admin) {
  const accessToken = jwt.sign(
    { adminId: admin.id, role: admin.role },
    env.jwtSecrets[0],
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' },
  );

  const refreshToken = jwt.sign(
    { adminId: admin.id, type: 'refresh' },
    env.jwtSecrets[0],
    { expiresIn: REFRESH_TOKEN_EXPIRY, algorithm: 'HS256' },
  );

  return { accessToken, refreshToken };
}

async function logAdminAction({ adminUserId, action, targetType, targetId, metadata, ipAddress, userAgent }) {
  try {
    await adminRepository.createAuditLog({
      adminUserId,
      action,
      targetType,
      targetId,
      metadata: metadata || {},
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('[ADMIN AUDIT] Failed to log:', error.message);
  }
}

export const adminService = {
  async login({ email, password, ipAddress, userAgent }) {
    const admin = await adminRepository.findAdminByEmail(email);
    if (!admin) {
      throw new Error('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new Error('Admin account is deactivated');
    }

    const validPassword = await bcrypt.compare(password, admin.passwordHash);
    if (!validPassword) {
      await logAdminAction({
        adminUserId: admin.id,
        action: 'ADMIN_LOGIN',
        targetType: 'ADMIN',
        targetId: admin.id,
        metadata: { success: false, reason: 'invalid_password' },
        ipAddress,
        userAgent,
      });
      throw new Error('Invalid email or password');
    }

    const tokens = generateTokens(admin);

    await adminRepository.updateAdmin(admin.id, { lastLoginAt: new Date() });

    await logAdminAction({
      adminUserId: admin.id,
      action: 'ADMIN_LOGIN',
      targetType: 'ADMIN',
      targetId: admin.id,
      metadata: { success: true },
      ipAddress,
      userAgent,
    });

    return {
      admin: {
        id: admin.id, email: admin.email, name: admin.name,
        role: admin.role, permissions: admin.permissions,
      },
      ...tokens,
    };
  },

  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, env.jwtSecrets[0]);
      if (decoded.type !== 'refresh') throw new Error('Invalid refresh token');

      const admin = await adminRepository.findAdminById(decoded.adminId);
      if (!admin || !admin.isActive) throw new Error('Admin not found or deactivated');

      const tokens = generateTokens(admin);
      return {
        admin: {
          id: admin.id, email: admin.email, name: admin.name,
          role: admin.role, permissions: admin.permissions,
        },
        ...tokens,
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new Error('Invalid or expired refresh token');
      }
      throw error;
    }
  },

  async getProfile(adminId) {
    const admin = await adminRepository.findAdminById(adminId);
    if (!admin) throw new Error('Admin not found');
    return {
      id: admin.id, email: admin.email, name: admin.name,
      role: admin.role, permissions: admin.permissions,
      isActive: admin.isActive, lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  },

  async createAdmin({ email, password, name, role, permissions }, creatorId, ipAddress, userAgent) {
    const existing = await adminRepository.findAdminByEmail(email);
    if (existing) throw new Error('Admin with this email already exists');

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await adminRepository.createAdmin({
      email, passwordHash, name, role, permissions,
    });

    await logAdminAction({
      adminUserId: creatorId,
      action: 'USER_CREATED',
      targetType: 'ADMIN',
      targetId: admin.id,
      metadata: { email, role, createdBy: creatorId },
      ipAddress, userAgent,
    });

    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  },

  async updateAdmin(id, data, updaterId, ipAddress, userAgent) {
    const admin = await adminRepository.findAdminById(id);
    if (!admin) throw new Error('Admin not found');

    if (data.password) {
      data.passwordHash = await bcrypt.hash(data.password, 12);
      delete data.password;
    }

    const updated = await adminRepository.updateAdmin(id, data);

    await logAdminAction({
      adminUserId: updaterId,
      action: 'USER_UPDATED',
      targetType: 'ADMIN',
      targetId: id,
      metadata: { changes: Object.keys(data), updatedBy: updaterId },
      ipAddress, userAgent,
    });

    return updated;
  },

  async listAdmins(query) {
    return adminRepository.listAdmins(query);
  },

  async deleteAdmin(id, deleterId, ipAddress, userAgent) {
    if (id === deleterId) throw new Error('Cannot delete your own account');

    await adminRepository.deleteAdmin(id);

    await logAdminAction({
      adminUserId: deleterId,
      action: 'USER_DELETED',
      targetType: 'ADMIN',
      targetId: id,
      metadata: { deletedBy: deleterId },
      ipAddress, userAgent,
    });
  },

  async getAuditLogs(query) {
    return adminRepository.listAuditLogs(query);
  },

  async getDevices(query) {
    return adminRepository.listDevices(query);
  },

  async blockDevice(id, blockedBy, blockReason, ipAddress, userAgent) {
    const device = await adminRepository.blockDevice(id, blockedBy, blockReason);

    await logAdminAction({
      adminUserId: blockedBy,
      action: 'DEVICE_BLOCKED',
      targetType: 'DEVICE',
      targetId: id,
      metadata: { reason: blockReason, blockedBy },
      ipAddress, userAgent,
    });

    return device;
  },

  async unblockDevice(id, unblockedBy, ipAddress, userAgent) {
    const device = await adminRepository.unblockDevice(id);

    await logAdminAction({
      adminUserId: unblockedBy,
      action: 'DEVICE_UNBLOCKED',
      targetType: 'DEVICE',
      targetId: id,
      metadata: { unblockedBy },
      ipAddress, userAgent,
    });

    return device;
  },

  async getFeatureFlags() {
    return adminRepository.listFeatureFlags();
  },

  async toggleFeatureFlag(id, enabled, toggledBy, ipAddress, userAgent) {
    const flag = await adminRepository.toggleFeatureFlag(id, enabled);

    await logAdminAction({
      adminUserId: toggledBy,
      action: 'FEATURE_FLAG_TOGGLED',
      targetType: 'FEATURE_FLAG',
      targetId: id,
      metadata: { key: flag.key, enabled },
      ipAddress, userAgent,
    });

    return flag;
  },

  async createFeatureFlag(data, creatorId, ipAddress, userAgent) {
    const flag = await adminRepository.createFeatureFlag(data);

    await logAdminAction({
      adminUserId: creatorId,
      action: 'FEATURE_FLAG_TOGGLED',
      targetType: 'FEATURE_FLAG',
      targetId: flag.id,
      metadata: { key: flag.key, name: flag.name },
      ipAddress, userAgent,
    });

    return flag;
  },

  async updateFeatureFlag(id, data, updaterId, ipAddress, userAgent) {
    const flag = await adminRepository.updateFeatureFlag(id, data);

    await logAdminAction({
      adminUserId: updaterId,
      action: 'FEATURE_FLAG_TOGGLED',
      targetType: 'FEATURE_FLAG',
      targetId: id,
      metadata: { key: flag.key, changes: Object.keys(data) },
      ipAddress, userAgent,
    });

    return flag;
  },

  async listTenants(query) {
    return adminRepository.listTenants(query);
  },

  async updateTenantStatus(id, status, adminId, ipAddress, userAgent) {
    const tenant = await adminRepository.updateTenantStatus(id, status);

    await logAdminAction({
      adminUserId: adminId,
      action: status === 'SUSPENDED' ? 'SHOP_SUSPENDED' : 'SHOP_APPROVED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { status },
      ipAddress, userAgent,
    });

    return tenant;
  },

  async getDashboardStats() {
    return adminRepository.getDashboardStats();
  },

  async getExpiringSubscriptions(days) {
    const now = new Date();
    const target = new Date();
    target.setDate(target.getDate() + days);

    const subscriptions = await prisma.subscription.findMany({
      where: {
        endDate: { gte: now, lte: target },
        status: { in: ['ACTIVE', 'TRIAL', 'GRACE_PERIOD'] },
      },
      include: {
        tenant: { select: { name: true, email: true } },
        plan: { select: { name: true, price: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    return subscriptions;
  },
};
