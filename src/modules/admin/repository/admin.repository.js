import prisma from '../../../config/prisma.js';

export const adminRepository = {
  async findAdminByEmail(email) {
    return prisma.adminUser.findUnique({ where: { email } });
  },

  async findAdminById(id) {
    return prisma.adminUser.findUnique({ where: { id } });
  },

  async createAdmin(data) {
    return prisma.adminUser.create({ data });
  },

  async updateAdmin(id, data) {
    return prisma.adminUser.update({ where: { id }, data });
  },

  async listAdmins({ page, limit, search, role, isActive, sortBy, sortOrder }) {
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;

    const [admins, total] = await Promise.all([
      prisma.adminUser.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true, email: true, name: true, role: true,
          permissions: true, isActive: true, lastLoginAt: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.adminUser.count({ where }),
    ]);

    return { admins, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async deleteAdmin(id) {
    return prisma.adminUser.delete({ where: { id } });
  },

  async createAuditLog(data) {
    return prisma.adminAuditLog.create({ data });
  },

  async listAuditLogs({ page, limit, adminUserId, action, targetType, targetId, from, to, sortBy, sortOrder }) {
    const where = {};
    if (adminUserId) where.adminUserId = adminUserId;
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async listDevices({ page, limit, search, isBlocked, minRiskScore, sortBy, sortOrder }) {
    const where = {};
    if (search) {
      where.OR = [
        { browser: { contains: search, mode: 'insensitive' } },
        { os: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search } },
        { fingerprintHash: { contains: search } },
      ];
    }
    if (isBlocked !== undefined) where.isBlocked = isBlocked;
    if (minRiskScore) where.riskScore = { gte: minRiskScore };

    const [devices, total] = await Promise.all([
      prisma.adminDevice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy || 'lastSeen']: sortOrder || 'desc' },
      }),
      prisma.adminDevice.count({ where }),
    ]);

    return { devices, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async blockDevice(id, blockedBy, blockReason) {
    return prisma.adminDevice.update({
      where: { id },
      data: { isBlocked: true, blockedAt: new Date(), blockedBy, blockReason },
    });
  },

  async unblockDevice(id) {
    return prisma.adminDevice.update({
      where: { id },
      data: { isBlocked: false, blockedAt: null, blockedBy: null, blockReason: null },
    });
  },

  async upsertDevice(data) {
    return prisma.adminDevice.upsert({
      where: { id: data.id || '00000000-0000-0000-0000-000000000000' },
      create: data,
      update: { ...data, lastSeen: new Date() },
    });
  },

  async listFeatureFlags() {
    return prisma.adminFeatureFlag.findMany({ orderBy: { updatedAt: 'desc' } });
  },

  async getFeatureFlag(key) {
    return prisma.adminFeatureFlag.findUnique({ where: { key } });
  },

  async toggleFeatureFlag(id, enabled, updatedBy) {
    return prisma.adminFeatureFlag.update({
      where: { id },
      data: { enabled, updatedAt: new Date() },
    });
  },

  async updateFeatureFlag(id, data) {
    const updateData = { ...data, updatedAt: new Date() };
    return prisma.adminFeatureFlag.update({ where: { id }, data: updateData });
  },

  async createFeatureFlag(data) {
    return prisma.adminFeatureFlag.create({ data });
  },

  async listTenants({ page, limit, search, status, sortBy, sortOrder }) {
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
        include: {
          _count: { select: { users: true, branches: true } },
          subscription: { include: { plan: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return { tenants, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async updateTenantStatus(id, status) {
    return prisma.tenant.update({ where: { id }, data: { status } });
  },

  async getDashboardStats() {
    const [
      totalTenants, activeTenants, suspendedTenants,
      totalUsers, totalAdmins,
      totalSubscriptions, activeSubscriptions, expiredSubscriptions,
      todaysRegistrations,
      totalDevices, blockedDevices,
      recentLogs, totalRevenue,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count(),
      prisma.adminUser.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.tenant.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      prisma.adminDevice.count(),
      prisma.adminDevice.count({ where: { isBlocked: true } }),
      prisma.adminAuditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
    ]);

    return {
      tenants: { total: totalTenants, active: activeTenants, suspended: suspendedTenants },
      users: { total: totalUsers },
      admins: { total: totalAdmins },
      subscriptions: { total: totalSubscriptions, active: activeSubscriptions, expired: expiredSubscriptions },
      todaysRegistrations,
      devices: { total: totalDevices, blocked: blockedDevices },
      revenue: totalRevenue._sum.amount || 0,
      recentLogs,
    };
  },
};
