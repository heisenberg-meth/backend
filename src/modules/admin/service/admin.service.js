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

  async unlinkDevice(id) {
    const device = await adminRepository.getDeviceById(id);
    if (!device) throw new Error('Device not found');
    await adminRepository.blockDevice(id, 'System', 'Unlinked by admin');
    await adminRepository.createAuditLog({
      action: 'DEVICE_UNBLOCKED',
      targetType: 'DEVICE',
      targetId: id,
      metadata: { reason: 'Admin unlink' },
    });
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

  async deleteUser(tenantId, userId) {
    const user = await adminRepository.findUser(tenantId, userId);
    if (!user) throw new Error('User not found');
    await adminRepository.softDeleteUser(userId);
    await adminRepository.createAuditLog({
      action: 'USER_DELETED',
      targetType: 'USER',
      targetId: userId,
      metadata: { tenantId, userName: user.fullName },
    });
  },

  async resetUserPassword(tenantId, userId) {
    const user = await adminRepository.findUser(tenantId, userId);
    if (!user) throw new Error('User not found');
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(tempPassword, 10);
    await adminRepository.updateUser(userId, { password: hash, resetOtpVerified: false });
    await adminRepository.createAuditLog({
      action: 'USER_PASSWORD_RESET',
      targetType: 'USER',
      targetId: userId,
      metadata: { tenantId },
    });
    return { tempPassword };
  },

  async resetUserDevice(tenantId, userId) {
    const user = await adminRepository.findUser(tenantId, userId);
    if (!user) throw new Error('User not found');
    await adminRepository.resetUserDevices(userId);
    await adminRepository.createAuditLog({
      action: 'USER_DEVICE_RESET',
      targetType: 'USER',
      targetId: userId,
      metadata: { tenantId },
    });
  },

  async listSubscriptions(query) {
    return adminRepository.listAllSubscriptions(query);
  },

  async updateSubscription(id, data) {
    const sub = await adminRepository.findSubscription(id);
    if (!sub) throw new Error('Subscription not found');
    const allowed = ['planId', 'autoRenew'];
    const filtered = {};
    for (const k of allowed) {
      if (data[k] !== undefined) filtered[k] = data[k];
    }
    if (!Object.keys(filtered).length) throw new Error('No valid fields');
    await adminRepository.updateSubscription(id, filtered);
    if (data.planId && data.planId !== sub.planId) {
      await adminRepository.createAuditLog({
        action: 'SUBSCRIPTION_UPGRADED',
        targetType: 'SUBSCRIPTION',
        targetId: id,
        metadata: { from: sub.planId, to: data.planId },
      });
    }
    return adminRepository.findSubscription(id);
  },

  async renewSubscription(id, { days }) {
    const sub = await adminRepository.findSubscription(id);
    if (!sub) throw new Error('Subscription not found');
    const daysNum = parseInt(days) || 365;
    const endDate = sub.endDate && new Date(sub.endDate) > new Date()
      ? new Date(new Date(sub.endDate).getTime() + daysNum * 86400000)
      : new Date(Date.now() + daysNum * 86400000);
    await adminRepository.updateSubscription(id, {
      status: 'ACTIVE',
      endDate,
      startDate: sub.startDate || new Date(),
    });
    await adminRepository.createAuditLog({
      action: 'SUBSCRIPTION_RENEWED',
      targetType: 'SUBSCRIPTION',
      targetId: id,
      metadata: { days: daysNum, newEndDate: endDate },
    });
    return adminRepository.findSubscription(id);
  },

  async extendSubscription(id, { days }) {
    const sub = await adminRepository.findSubscription(id);
    if (!sub) throw new Error('Subscription not found');
    const daysNum = parseInt(days) || 30;
    const currentEnd = sub.endDate && new Date(sub.endDate) > new Date() ? new Date(sub.endDate) : new Date();
    const newEnd = new Date(currentEnd.getTime() + daysNum * 86400000);
    await adminRepository.updateSubscription(id, { endDate: newEnd });
    await adminRepository.createAuditLog({
      action: 'SUBSCRIPTION_EXTENDED',
      targetType: 'SUBSCRIPTION',
      targetId: id,
      metadata: { days: daysNum, newEndDate: newEnd },
    });
    return adminRepository.findSubscription(id);
  },

  async cancelSubscription(id) {
    const sub = await adminRepository.findSubscription(id);
    if (!sub) throw new Error('Subscription not found');
    await adminRepository.updateSubscription(id, { status: 'EXPIRED', endDate: new Date() });
    await adminRepository.createAuditLog({
      action: 'SUBSCRIPTION_CANCELLED',
      targetType: 'SUBSCRIPTION',
      targetId: id,
    });
    return adminRepository.findSubscription(id);
  },

  async listShops(query) {
    return adminRepository.listShops(query);
  },

  async getShopDetail(id) {
    const shop = await adminRepository.getShopDetail(id);
    if (!shop) throw new Error('Shop not found');
    return shop;
  },

  async updateShop(id, data) {
    const allowed = ['name', 'email', 'phone', 'address', 'gstNumber', 'drugLicenseNumber'];
    const filtered = {};
    for (const k of allowed) {
      if (data[k] !== undefined) filtered[k] = data[k];
    }
    if (!Object.keys(filtered).length) throw new Error('No valid fields to update');
    await adminRepository.updateTenant(id, filtered);
    return adminRepository.getShopDetail(id);
  },

  async approveShop(id) {
    const shop = await adminRepository.getShopDetail(id);
    if (!shop) throw new Error('Shop not found');
    await adminRepository.updateTenant(id, { isVerified: true, verifiedAt: new Date() });
    await adminRepository.createAuditLog({
      action: 'SHOP_APPROVED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { shopName: shop.name },
    });
    return adminRepository.getShopDetail(id);
  },

  async suspendShop(id) {
    const shop = await adminRepository.getShopDetail(id);
    if (!shop) throw new Error('Shop not found');
    await adminRepository.updateTenantStatus(id, 'SUSPENDED');
    return adminRepository.getShopDetail(id);
  },

  async blockShop(id, reason) {
    const shop = await adminRepository.getShopDetail(id);
    if (!shop) throw new Error('Shop not found');
    await adminRepository.updateTenant(id, { blacklisted: true, blacklistedAt: new Date(), blacklistReason: reason || null });
    return adminRepository.getShopDetail(id);
  },

  async deleteShop(id) {
    const shop = await adminRepository.getShopDetail(id);
    if (!shop) throw new Error('Shop not found');
    await adminRepository.deleteTenant(id);
    await adminRepository.createAuditLog({
      action: 'SHOP_DELETED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { shopName: shop.name },
    });
  },

  async listTenants(query) {
    return adminRepository.listTenants(query);
  },

  async getTenantDetail(id) {
    const tenant = await adminRepository.getTenantDetail(id);
    if (!tenant) throw new Error('Tenant not found');
    return tenant;
  },

  async verifyTenant(id, adminId, ipAddress, userAgent) {
    const tenant = await adminRepository.updateTenant(id, {
      isVerified: true,
      verifiedAt: new Date(),
    });

    await logAdminAction({
      adminUserId: adminId,
      action: 'SHOP_APPROVED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { verified: true },
      ipAddress, userAgent,
    });

    return tenant;
  },

  async blacklistTenant(id, reason, adminId, ipAddress, userAgent) {
    const tenant = await adminRepository.updateTenant(id, {
      blacklisted: true,
      blacklistedAt: new Date(),
      blacklistReason: reason,
    });

    await logAdminAction({
      adminUserId: adminId,
      action: 'SHOP_BLACKLISTED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { reason },
      ipAddress, userAgent,
    });

    return tenant;
  },

  async unblacklistTenant(id, adminId, ipAddress, userAgent) {
    const tenant = await adminRepository.updateTenant(id, {
      blacklisted: false,
      blacklistedAt: null,
      blacklistReason: null,
    });

    await logAdminAction({
      adminUserId: adminId,
      action: 'SHOP_UPDATED',
      targetType: 'TENANT',
      targetId: id,
      metadata: { blacklisted: false },
      ipAddress, userAgent,
    });

    return tenant;
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

  async getDashboardTrends() {
    return adminRepository.getDashboardTrends();
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

  async getSystemHealth() {
    const dbStart = Date.now();
    let dbStatus = 'healthy';
    let dbLatency = 0;
    try {
      await adminRepository.pingDatabase();
      dbLatency = Date.now() - dbStart;
    } catch {
      dbStatus = 'unhealthy';
      dbLatency = Date.now() - dbStart;
    }

    const mem = process.memoryUsage();
    const uptime = process.uptime();

    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m`;

    return {
      status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
      uptime: uptimeStr,
      uptimeSeconds: uptime,
      database: {
        status: dbStatus,
        latency: dbLatency,
      },
      memory: {
        heapUsed: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        heapTotal: `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`,
        rss: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      },
      counts: await adminRepository.getSystemCounts(),
    };
  },

  async listSupportTickets(query) {
    return adminRepository.listSupportTickets(query);
  },

  async getSupportTicket(id) {
    const ticket = await adminRepository.getSupportTicket(id);
    if (!ticket) throw new Error('Ticket not found');
    return ticket;
  },

  async replySupportTicket(ticketId, message, adminId) {
    const ticket = await adminRepository.getSupportTicket(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    return adminRepository.createSupportReply(ticketId, message, adminId);
  },

  async updateSupportTicketStatus(ticketId, status) {
    const valid = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'];
    if (!valid.includes(status)) throw new Error('Invalid status');
    return adminRepository.updateSupportTicketStatus(ticketId, status);
  },

  async getExpiryOverview() {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 86400000);
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in15Days = new Date(now.getTime() + 15 * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [expiring3Days, expiring7Days, expiring15Days, expiring30Days, alreadyExpired, activeTotal] = await Promise.all([
      adminRepository.getSubscriptionsExpiringBetween(now, in3Days),
      adminRepository.getSubscriptionsExpiringBetween(in3Days, in7Days),
      adminRepository.getSubscriptionsExpiringBetween(in7Days, in15Days),
      adminRepository.getSubscriptionsExpiringBetween(in15Days, in30Days),
      adminRepository.getSubscriptionsExpiringBefore(now),
      adminRepository.getSubscriptionCountByStatus('ACTIVE'),
    ]);

    return {
      expiringIn3Days: expiring3Days,
      expiringIn7Days: expiring7Days,
      expiringIn15Days: expiring15Days,
      expiringIn30Days: expiring30Days,
      alreadyExpired: alreadyExpired,
      activeTotal,
    };
  },

  async sendExpiryReminders({ period, message, channel }) {
    const now = new Date();
    let targetDate;
    if (period === '3days') targetDate = new Date(now.getTime() + 3 * 86400000);
    else if (period === '7days') targetDate = new Date(now.getTime() + 7 * 86400000);
    else if (period === '15days') targetDate = new Date(now.getTime() + 15 * 86400000);
    else if (period === '30days') targetDate = new Date(now.getTime() + 30 * 86400000);
    else if (period === 'expired') return adminRepository.sendExpiryRemindersToExpired(channel, message);
    else throw new Error('Invalid period. Use: 3days, 7days, 15days, 30days, or expired');

    const tenants = await adminRepository.getSubscriptionsExpiringBetween(now, targetDate);
    let sent = 0, failed = 0;

    for (const t of tenants) {
      try {
        await adminRepository.createBroadcast({
          tenantId: t.tenantId,
          channel: channel || 'EMAIL',
          subject: 'Subscription Expiry Notice',
          message,
          status: 'PENDING',
        });
        sent++;
      } catch {
        failed++;
      }
    }

    return { total: tenants.length, sent, failed };
  },

  async sendBroadcast({ channel, subject, message, filters }) {
    const tenants = await adminRepository.getFilteredTenants(filters || {});
    if (!tenants.length) throw new Error('No recipients match the given filters');

    const results = { total: tenants.length, sent: 0, failed: 0, errors: [] };

    for (const tenant of tenants) {
      try {
        await adminRepository.createBroadcast({
          tenantId: tenant.id,
          channel,
          subject,
          message,
          status: 'PENDING',
        });
        results.sent++;
      } catch (err) {
        results.failed++;
        results.errors.push({ tenantId: tenant.id, error: err.message });
      }
    }

    return results;
  },

  async getRevenueOverview() {
    return adminRepository.getRevenueOverview();
  },

  async getMonthlyRevenue(months) {
    return adminRepository.getMonthlyRevenue(months);
  },

  async generateInvoice({ tenantId, amount, description }) {
    const tenant = await adminRepository.getShopDetail(tenantId);
    if (!tenant) throw new Error('Shop not found');
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const payment = await adminRepository.createPayment({
      tenantId,
      amount,
      currency: 'INR',
      status: 'PENDING',
      transactionId: `manual-${Date.now()}`,
      description: description || 'Manual invoice',
    });
    await adminRepository.createAuditLog({
      action: 'PAYMENT_RECEIVED',
      targetType: 'PAYMENT',
      targetId: payment.id,
      metadata: { invoiceNumber, amount, tenantId },
    });
    return { ...payment, invoiceNumber };
  },

  async listPayments(query) {
    return adminRepository.listPayments(query);
  },

  async getPaymentDetail(id) {
    const payment = await adminRepository.getPaymentDetail(id);
    if (!payment) throw new Error('Payment not found');
    return payment;
  },

  async refundPayment(id, reason, adminId, ipAddress, userAgent) {
    const payment = await adminRepository.updatePayment(id, {
      status: 'REFUNDED',
      refundId: `ADMIN_REFUND_${Date.now()}`,
      metadata: { refundedBy: adminId, reason, refundedAt: new Date().toISOString() },
    });

    await logAdminAction({
      adminUserId: adminId,
      action: 'PAYMENT_REFUNDED',
      targetType: 'PAYMENT',
      targetId: id,
      metadata: { amount: payment.amount, reason },
      ipAddress, userAgent,
    });

    return payment;
  },

  async updatePaymentStatus(id, status, adminId, ipAddress, userAgent) {
    const payment = await adminRepository.updatePayment(id, { status });

    await logAdminAction({
      adminUserId: adminId,
      action: status === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_RECEIVED',
      targetType: 'PAYMENT',
      targetId: id,
      metadata: { fromStatus: payment.status, toStatus: status },
      ipAddress, userAgent,
    });

    return payment;
  },

  async getSecurityOverview() {
    return adminRepository.getSecurityOverview();
  },

  async getLoginAttempts(query) {
    return adminRepository.getLoginAttempts(query);
  },

  async getSecurityAlerts() {
    return adminRepository.getSecurityAlerts();
  },
};
