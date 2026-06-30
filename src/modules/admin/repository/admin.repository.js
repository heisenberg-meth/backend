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
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
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
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          permissions: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.adminUser.count({ where }),
    ]);

    return {
      admins,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async deleteAdmin(id) {
    return prisma.adminUser.delete({ where: { id } });
  },

  async createAuditLog(data) {
    return prisma.adminAuditLog.create({ data });
  },

  async listAuditLogs({
    page,
    limit,
    adminUserId,
    action,
    targetType,
    targetId,
    from,
    to,
    sortBy,
    sortOrder,
  }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
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
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return { logs, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  },

  async listOtpLogs({ page, limit, search, status, purpose }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const where = {};
    if (search) {
      where.OR = [{ email: { contains: search, mode: 'insensitive' } }];
    }
    if (status) where.status = status;
    if (purpose) where.purpose = purpose;

    const [logs, total] = await Promise.all([
      prisma.otpAuditLog.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.otpAuditLog.count({ where }),
    ]);

    return { logs, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  },

  async getLatestOtp(email) {
    return prisma.otpAuditLog.findFirst({
      where: { email, otp: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getDeviceById(id) {
    return prisma.adminDevice.findUnique({ where: { id } });
  },

  async listDevices({ page, limit, search, isBlocked, minRiskScore, sortBy, sortOrder }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
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
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortBy || 'lastSeen']: sortOrder || 'desc' },
      }),
      prisma.adminDevice.count({ where }),
    ]);

    return {
      devices,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
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

  async toggleFeatureFlag(id, enabled) {
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

  async listAllSubscriptions({ status, search, page = 1, limit = 20 }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
        { tenant: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: { plan: true, tenant: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.subscription.count({ where }),
    ]);
    return {
      subscriptions: subs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async findSubscription(id) {
    return prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, tenant: { select: { name: true, email: true, phone: true } } },
    });
  },

  async updateSubscription(id, data) {
    return prisma.subscription.update({ where: { id }, data });
  },

  async findUser(tenantId, userId) {
    return prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null } });
  },

  async softDeleteUser(userId) {
    return prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  },

  async updateUser(userId, data) {
    return prisma.user.update({ where: { id: userId }, data });
  },

  async resetUserDevices(userId) {
    await prisma.adminDevice.updateMany({
      where: { userId },
      data: { isBlocked: true, blockedAt: new Date(), blockReason: 'Admin reset' },
    });
  },

  async revokeUserSessions(userId) {
    await prisma.userSession.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  },

  async listAllUsers({ page, limit, search, status, role, tenantId }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = { deletedAt: null };
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    if (status) where.status = status;
    if (role) where.role = role;
    if (tenantId) where.tenantId = tenantId;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          blockedAt: true,
          blockedReason: true,
          phone: true,
          createdAt: true,
          tenantId: true,
          tenant: { select: { name: true, email: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async listShops({ search, status, verified, page = 1, limit = 20 }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = {};
    if (status) where.status = status;
    if (verified !== undefined) where.isVerified = verified === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { gstNumber: { contains: search, mode: 'insensitive' } },
        { drugLicenseNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    const [shops, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          subscription: { include: { plan: true } },
          storeProfiles: { take: 1 },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.tenant.count({ where }),
    ]);
    return {
      shops,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async getShopDetail(id) {
    return prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        storeProfiles: true,
        _count: { select: { users: true, adminDevices: true } },
      },
    });
  },

  async deleteTenant(id) {
    await prisma.tenant.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  },

  async listTenants({ page, limit, search, status, sortBy, sortOrder, verified, blacklisted }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 25;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { gstNumber: { contains: search } },
        { drugLicenseNumber: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    if (status) where.status = status;
    if (verified === 'true') where.isVerified = true;
    else if (verified === 'false') where.isVerified = false;
    if (blacklisted === 'true') where.blacklisted = true;
    else if (blacklisted === 'false') where.blacklisted = false;

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortBy || 'createdAt']: sortOrder || 'desc' },
        include: {
          _count: { select: { users: true, branches: true } },
          subscription: { include: { plan: true } },
          storeProfiles: {
            take: 1,
            select: { drugLicenseNumber: true, gstin: true, isVerified: true, status: true },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return {
      tenants,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async getTenantDetail(id) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        storeProfiles: {
          include: { documents: true },
        },
        subscription: { include: { plan: true } },
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            branches: true,
          },
        },
        users: {
          where: { deletedAt: null },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
            status: true,
            blockedAt: true,
            blockedReason: true,
            phone: true,
            createdAt: true,
          },
        },
      },
    });

    if (!tenant) return null;

    const deviceCount = await prisma.device.count({
      where: { user: { tenantId: id, deletedAt: null } },
    });

    const devices = await prisma.device.findMany({
      where: { user: { tenantId: id, deletedAt: null } },
      orderBy: { lastSeen: 'desc' },
      take: 20,
      include: { user: { select: { fullName: true } } },
    });

    return { ...tenant, deviceCount, devices };
  },

  async updateTenant(id, data) {
    return prisma.tenant.update({ where: { id }, data });
  },

  async updateTenantStatus(id, status) {
    return prisma.tenant.update({ where: { id }, data: { status } });
  },

  async pingDatabase() {
    await prisma.$queryRaw`SELECT 1`;
  },

  async getSystemCounts() {
    const [tenants, users, subscriptions, payments, devices, tickets] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.subscription.count(),
      prisma.payment.count(),
      prisma.device.count(),
      prisma.supportTicket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    ]);
    return { tenants, users, subscriptions, payments, devices, openTickets: tickets };
  },

  async listSupportTickets({ status, priority, search, tenantId, userId, page = 1, limit = 20 }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.createdBy = userId;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          creator: { select: { id: true, fullName: true, email: true } },
          assignee: { select: { id: true, fullName: true, email: true } },
          tenant: { select: { id: true, shopName: true } },
          replies: { include: { author: { select: { id: true, fullName: true, role: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return { tickets, total, page: pageNum, limit: limitNum };
  },

  async getSupportTicket(id) {
    return prisma.supportTicket.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, fullName: true, email: true, role: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
        replies: {
          include: { author: { select: { id: true, fullName: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async createSupportReply(ticketId, message, authorId) {
    const reply = await prisma.supportTicketReply.create({
      data: { ticketId, authorId, authorRole: 'ADMIN', message },
    });
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'WAITING_FOR_STAFF' },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'REPLY_ADDED',
        newValue: 'ADMIN',
        performedBy: authorId,
      },
    });

    return reply;
  },

  async updateSupportTicketStatus(ticketId, status, performedBy) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    const data = { status };
    if (status === 'RESOLVED') data.resolvedAt = new Date();

    const updated = await prisma.supportTicket.update({ where: { id: ticketId }, data });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'STATUS_CHANGED',
        oldValue: ticket?.status,
        newValue: status,
        performedBy: performedBy || 'system',
      },
    });

    return updated;
  },

  async assignTicket(ticketId, assignedToId, performedBy) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: assignedToId,
        status: ticket?.status === 'OPEN' ? 'IN_PROGRESS' : ticket?.status,
      },
    });

    await prisma.supportAuditLog.create({
      data: {
        ticketId,
        action: 'ASSIGNED',
        oldValue: ticket?.assignedTo,
        newValue: assignedToId,
        performedBy,
      },
    });

    return updated;
  },

  async getSubscriptionsExpiringBetween(start, end) {
    const subs = await prisma.subscription.findMany({
      where: { endDate: { gte: start, lte: end }, status: 'ACTIVE' },
      include: { tenant: { select: { id: true, shopName: true, email: true, phone: true } } },
    });
    return subs.map((s) => ({
      tenantId: s.tenantId,
      shopName: s.tenant.shopName,
      email: s.tenant.email,
      phone: s.tenant.phone,
      endDate: s.endDate,
      planId: s.planId,
    }));
  },

  async getSubscriptionsExpiringBefore(date) {
    const subs = await prisma.subscription.findMany({
      where: { endDate: { lte: date }, status: { not: 'EXPIRED' } },
      include: { tenant: { select: { id: true, shopName: true, email: true, phone: true } } },
    });
    return subs.map((s) => ({
      tenantId: s.tenantId,
      shopName: s.tenant.shopName,
      email: s.tenant.email,
      phone: s.tenant.phone,
      endDate: s.endDate,
      planId: s.planId,
    }));
  },

  async getSubscriptionCountByStatus(status) {
    return prisma.subscription.count({ where: { status } });
  },

  async getFilteredTenants(filters) {
    const where = {};
    if (filters.status) where.status = filters.status;
    if (filters.plan) where.plan = filters.plan;
    return prisma.tenant.findMany({
      where,
      select: { id: true, shopName: true, email: true, phone: true },
    });
  },

  async createBroadcast(data) {
    return prisma.notification.create({
      data: {
        tenantId: data.tenantId,
        channel: data.channel,
        subject: data.subject || null,
        message: data.message,
        deliveryStatus: data.status || 'QUEUED',
      },
    });
  },

  async getRevenueOverview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalRevenue,
      currentMonthRevenue,
      lastMonthRevenue,
      totalSubscriptions,
      activeSubscriptions,
      expiredSubscriptions,
      trialSubscriptions,
      subscriptionsStartedLastMonth,
      subscriptionsEndedLastMonth,
      successfulPayments,
      totalTenants,
      totalTenantsWithPaidSub,
    ] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: monthStart } },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.subscription.count({ where: { status: 'TRIAL' } }),
      prisma.subscription.count({
        where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      prisma.subscription.count({
        where: { status: 'EXPIRED', updatedAt: { gte: lastMonthStart, lte: lastMonthEnd } },
      }),
      prisma.payment.count({ where: { status: 'SUCCESS' } }),
      prisma.tenant.count(),
      prisma.tenant.count({
        where: { subscription: { status: { in: ['ACTIVE', 'TRIAL', 'GRACE_PERIOD'] } } },
      }),
    ]);

    const mrr = Number(currentMonthRevenue._sum.amount || 0);
    const lastMrr = Number(lastMonthRevenue._sum.amount || 0);
    const arr = mrr * 12;
    const churnedLastMonth = subscriptionsEndedLastMonth;
    const mrrChurn = lastMrr > 0 ? (churnedLastMonth / lastMrr) * 100 : 0;
    const renewalRate =
      subscriptionsStartedLastMonth > 0
        ? Math.max(
            0,
            ((subscriptionsStartedLastMonth - churnedLastMonth) / subscriptionsStartedLastMonth) *
              100,
          )
        : 100;
    const conversionRate = totalTenants > 0 ? (totalTenantsWithPaidSub / totalTenants) * 100 : 0;

    return {
      mrr,
      arr,
      lastMonthMrr: lastMrr,
      mrrGrowth: lastMrr > 0 ? ((mrr - lastMrr) / lastMrr) * 100 : 0,
      churnRate: parseFloat(mrrChurn.toFixed(2)),
      renewalRate: parseFloat(renewalRate.toFixed(1)),
      conversionRate: parseFloat(conversionRate.toFixed(1)),
      totalRevenue: Number(totalRevenue._sum.amount || 0),
      totalTransactions: successfulPayments,
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        trial: trialSubscriptions,
      },
    };
  },

  async getMonthlyRevenue(months) {
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
      const end = new Date(new Date().getFullYear(), new Date().getMonth() - i + 1, 0);
      const result = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: start, lte: end } },
      });
      data.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: Number(result._sum.amount || 0),
      });
    }
    return data;
  },

  async getDashboardTrends() {
    const now = new Date();
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const day = date.toISOString().slice(0, 10);

      const [registrations, activeUsers, shopGrowth, subGrowth] = await Promise.all([
        prisma.tenant.count({ where: { createdAt: { gte: date, lt: next } } }),
        prisma.user.count({ where: { createdAt: { gte: date, lt: next } } }),
        prisma.tenant.count({ where: { createdAt: { lte: next } } }),
        prisma.subscription.count({ where: { createdAt: { lte: next } } }),
      ]);

      daily.push({
        date: day,
        registrations,
        activeUsers,
        totalShops: shopGrowth,
        totalSubscriptions: subGrowth,
      });
    }

    const monthlyRevenue = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const result = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: start, lte: end } },
      });
      monthlyRevenue.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue: Number(result._sum.amount || 0),
      });
    }

    return { daily, monthlyRevenue };
  },

  async getDashboardStats() {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      verifiedTenants,
      blacklistedTenants,
      totalUsers,
      activeUsersToday,
      totalAdmins,
      totalSubscriptions,
      activeSubscriptions,
      expiredSubscriptions,
      todaysRegistrations,
      totalDevices,
      blockedDevices,
      recentLogs,
      totalRevenue,
      failedLogins24h,
      expiringSubs,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { isVerified: true } }),
      prisma.tenant.count({ where: { blacklisted: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.adminUser.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      prisma.tenant.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.adminDevice.count(),
      prisma.adminDevice.count({ where: { isBlocked: true } }),
      prisma.adminAuditLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      prisma.adminAuditLog.count({
        where: {
          action: 'ADMIN_LOGIN',
          createdAt: { gte: todayStart },
          metadata: { path: ['success'], equals: false },
        },
      }),
      prisma.subscription.count({
        where: { status: 'ACTIVE', endDate: { lte: new Date(Date.now() + 7 * 86400000) } },
      }),
    ]);

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
        suspended: suspendedTenants,
        verified: verifiedTenants,
        blacklisted: blacklistedTenants,
      },
      users: { total: totalUsers, activeToday: activeUsersToday },
      admins: { total: totalAdmins },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expired: expiredSubscriptions,
      },
      todaysRegistrations,
      devices: { total: totalDevices, blocked: blockedDevices },
      revenue: totalRevenue._sum.amount || 0,
      failedLoginAttempts24h: failedLogins24h,
      expiringSubscriptions: expiringSubs,
      recentLogs,
    };
  },

  async listPayments({ page, limit, search, status, from, to }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = {};
    if (search) {
      where.OR = [
        { transactionId: { contains: search } },
        { razorpayPaymentId: { contains: search } },
        { razorpayOrderId: { contains: search } },
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { name: true, email: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async getPaymentDetail(id) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        tenant: { select: { name: true, email: true, phone: true } },
        allocations: { include: { invoice: true } },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  },

  async createPayment(data) {
    return prisma.payment.create({ data });
  },

  async updatePayment(id, data) {
    return prisma.payment.update({ where: { id }, data });
  },

  async getSecurityOverview() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [
      totalLoginAttempts,
      failedLogins24h,
      successfulLogins24h,
      uniqueIps24h,
      multipleFailedLogins,
      recentRegistrationAttempts,
      activeAdmins,
    ] = await Promise.all([
      prisma.adminAuditLog.count({ where: { action: 'ADMIN_LOGIN' } }),
      prisma.adminAuditLog.count({
        where: {
          action: 'ADMIN_LOGIN',
          createdAt: { gte: todayStart },
          metadata: { path: ['success'], equals: false },
        },
      }),
      prisma.adminAuditLog.count({
        where: {
          action: 'ADMIN_LOGIN',
          createdAt: { gte: todayStart },
          metadata: { path: ['success'], equals: true },
        },
      }),
      prisma.adminAuditLog.groupBy({
        by: ['ipAddress'],
        where: {
          action: 'ADMIN_LOGIN',
          createdAt: { gte: todayStart },
        },
      }),
      prisma.adminAuditLog.groupBy({
        by: ['adminUserId'],
        where: {
          action: 'ADMIN_LOGIN',
          createdAt: { gte: hourAgo },
          metadata: { path: ['success'], equals: false },
        },
        having: { adminUserId: { _count: { gte: 5 } } },
      }),
      prisma.registrationAttempt.count({
        where: { timestamp: { gte: hourAgo } },
      }),
      prisma.adminUser.count({ where: { isActive: true } }),
    ]);

    return {
      loginAttempts: {
        total: totalLoginAttempts,
        failed24h: failedLogins24h,
        success24h: successfulLogins24h,
      },
      uniqueIps24h: uniqueIps24h.length,
      bruteForceAlerts: multipleFailedLogins.length,
      recentRegistrations: recentRegistrationAttempts,
      activeAdmins,
    };
  },

  async getLoginAttempts({ page, limit, outcome, from, to }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
    const where = { action: 'ADMIN_LOGIN' };
    if (outcome === 'success') where.metadata = { path: ['success'], equals: true };
    else if (outcome === 'failed') where.metadata = { path: ['success'], equals: false };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [attempts, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return {
      attempts,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async getSecurityAlerts() {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [bruteForceIps, rapidRegistrations, recentBlocks, multipleAccountDevices] =
      await Promise.all([
        prisma.adminAuditLog.groupBy({
          by: ['ipAddress'],
          where: {
            action: 'ADMIN_LOGIN',
            createdAt: { gte: hourAgo },
            metadata: { path: ['success'], equals: false },
          },
          having: { ipAddress: { _count: { gte: 10 } } },
        }),
        prisma.registrationAttempt.count({
          where: { timestamp: { gte: hourAgo } },
        }),
        prisma.adminAuditLog.findMany({
          where: {
            action: { in: ['DEVICE_BLOCKED', 'SHOP_BLACKLISTED', 'USER_SUSPENDED'] },
            createdAt: { gte: dayAgo },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.adminDevice.groupBy({
          by: ['fingerprintHash'],
          where: { firstSeen: { gte: dayAgo } },
          having: { fingerprintHash: { _count: { gte: 2 } } },
        }),
      ]);

    return {
      bruteForceIps: bruteForceIps.map((b) => b.ipAddress).filter(Boolean),
      rapidRegistrations,
      recentBlocks,
      sharedFingerprints: multipleAccountDevices.map((d) => d.fingerprintHash).filter(Boolean),
    };
  },

  async listPaymentSessions({ page, limit, search, status, tenantId, from, to }) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const where = {};

    if (search) {
      where.OR = [
        { paymentSessionId: { contains: search } },
        { razorpayOrderId: { contains: search } },
        { razorpayPaymentId: { contains: search } },
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [sessions, total] = await Promise.all([
      prisma.paymentSession.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { id: true, name: true, email: true } },
          user: { select: { id: true, email: true, fullName: true } },
          subscriptionPlan: { select: { id: true, name: true } },
        },
      }),
      prisma.paymentSession.count({ where }),
    ]);

    return {
      sessions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  },

  async getPaymentSessionDetail(id) {
    return prisma.paymentSession.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, email: true, phone: true } },
        user: { select: { id: true, email: true, fullName: true, phone: true } },
        subscriptionPlan: { select: { id: true, name: true, price: true, billingCycle: true } },
      },
    });
  },

  async getPaymentSessionByPaymentSessionId(paymentSessionId) {
    return prisma.paymentSession.findUnique({
      where: { paymentSessionId },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, email: true, fullName: true } },
        subscriptionPlan: { select: { id: true, name: true, price: true } },
      },
    });
  },

  async updatePaymentSession(id, data) {
    return prisma.paymentSession.update({ where: { id }, data });
  },

  async getPaymentSessionStats() {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSessions,
      pendingSessions,
      successSessions,
      failedSessions,
      expiredSessions,
      sessionsToday,
      sessionsThisWeek,
      totalAmount,
    ] = await Promise.all([
      prisma.paymentSession.count(),
      prisma.paymentSession.count({ where: { status: 'PENDING' } }),
      prisma.paymentSession.count({ where: { status: 'SUBSCRIPTION_ACTIVATED' } }),
      prisma.paymentSession.count({ where: { status: 'PAYMENT_FAILED' } }),
      prisma.paymentSession.count({ where: { status: 'PAYMENT_EXPIRED' } }),
      prisma.paymentSession.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.paymentSession.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.paymentSession.aggregate({
        _sum: { amount: true },
        where: { status: 'SUBSCRIPTION_ACTIVATED' },
      }),
    ]);

    return {
      totalSessions,
      pendingSessions,
      successSessions,
      failedSessions,
      expiredSessions,
      sessionsToday,
      sessionsThisWeek,
      totalRevenue: totalAmount._sum.amount || 0,
    };
  },
};
