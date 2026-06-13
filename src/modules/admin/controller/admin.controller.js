import { ZodError } from 'zod';
import { adminService } from '../service/admin.service.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';
import env from '../../../config/env.js';
import {
  adminLoginSchema,
  adminRefreshSchema,
  adminCreateSchema,
  adminUpdateSchema,
  adminListQuerySchema,
  auditLogQuerySchema,
} from '../validators/admin.validator.js';

const isProduction = env.nodeEnv === 'production';

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  partitioned: isProduction,
  maxAge: 30 * 24 * 60 * 60,
};

const ACCESS_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax',
  secure: isProduction,
  partitioned: isProduction,
  maxAge: 15 * 60,
};

class AdminController {
  async login(request, reply) {
    try {
      const parsed = adminLoginSchema.parse(request.body);
      const result = await adminService.login({
        ...parsed,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.setCookie('adminRefreshToken', result.refreshToken, COOKIE_OPTIONS);
      reply.setCookie('adminAccessToken', result.accessToken, ACCESS_COOKIE_OPTIONS);

      return reply.send(
        success({
          admin: result.admin,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }),
      );
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        return reply.code(400).send(errorResponse('Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(401).send(errorResponse(error.message, 'ADMIN_LOGIN_FAILED'));
    }
  }

  async refresh(request, reply) {
    try {
      const parsed = adminRefreshSchema.parse(request.body);
      const result = await adminService.refreshToken(parsed.refreshToken);

      reply.setCookie('adminRefreshToken', result.refreshToken, COOKIE_OPTIONS);
      reply.setCookie('adminAccessToken', result.accessToken, ACCESS_COOKIE_OPTIONS);

      return reply.send(
        success({
          admin: result.admin,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }),
      );
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send(errorResponse('Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(401).send(errorResponse(error.message, 'REFRESH_FAILED'));
    }
  }

  async logout(request, reply) {
    reply.clearCookie('adminRefreshToken', { path: '/' });
    reply.clearCookie('adminAccessToken', { path: '/' });
    return reply.send(success({ message: 'Logged out successfully' }));
  }

  async me(request, reply) {
    try {
      const admin = await adminService.getProfile(request.admin.id);
      return reply.send(success(admin));
    } catch (error) {
      return reply.code(404).send(errorResponse(error.message, 'ADMIN_NOT_FOUND'));
    }
  }

  async createAdmin(request, reply) {
    try {
      const parsed = adminCreateSchema.parse(request.body);
      const admin = await adminService.createAdmin(
        parsed,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.code(201).send(success(admin));
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send(errorResponse('Validation failed', 'VALIDATION_ERROR'));
      }
      if (error.message === 'Admin with this email already exists') {
        return reply.code(409).send(errorResponse(error.message, 'ADMIN_EXISTS'));
      }
      return reply.code(400).send(errorResponse(error.message, 'ADMIN_CREATE_FAILED'));
    }
  }

  async updateAdmin(request, reply) {
    try {
      const parsed = adminUpdateSchema.parse(request.body);
      const admin = await adminService.updateAdmin(
        request.params.id,
        parsed,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(admin));
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send(errorResponse('Validation failed', 'VALIDATION_ERROR'));
      }
      if (error.message === 'Admin not found') {
        return reply.code(404).send(errorResponse(error.message, 'ADMIN_NOT_FOUND'));
      }
      return reply.code(400).send(errorResponse(error.message, 'ADMIN_UPDATE_FAILED'));
    }
  }

  async listAdmins(request, reply) {
    try {
      const parsed = adminListQuerySchema.parse(request.query);
      const result = await adminService.listAdmins(parsed);
      return reply.send(
        success(result.admins, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LIST_ADMINS_FAILED'));
    }
  }

  async deleteAdmin(request, reply) {
    try {
      await adminService.deleteAdmin(
        request.params.id,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success({ message: 'Admin deleted successfully' }));
    } catch (error) {
      if (error.message === 'Cannot delete your own account') {
        return reply.code(403).send(errorResponse(error.message, 'SELF_DELETE'));
      }
      return reply.code(400).send(errorResponse(error.message, 'ADMIN_DELETE_FAILED'));
    }
  }

  async getAuditLogs(request, reply) {
    try {
      const parsed = auditLogQuerySchema.parse(request.query);
      const result = await adminService.getAuditLogs(parsed);
      return reply.send(
        success(result.logs, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'AUDIT_LOGS_FAILED'));
    }
  }

  async getOtpLogs(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        status: request.query.status,
        purpose: request.query.purpose,
      };
      const result = await adminService.getOtpLogs(query);
      return reply.send(
        success(result.logs, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'OTP_LOGS_FAILED'));
    }
  }

  async getDevices(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        isBlocked:
          request.query.isBlocked === 'true'
            ? true
            : request.query.isBlocked === 'false'
              ? false
              : undefined,
        minRiskScore: request.query.minRiskScore ? parseInt(request.query.minRiskScore) : undefined,
        sortBy: request.query.sortBy || 'lastSeen',
        sortOrder: request.query.sortOrder || 'desc',
      };
      const result = await adminService.getDevices(query);
      return reply.send(
        success(result.devices, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'DEVICES_FAILED'));
    }
  }

  async blockDevice(request, reply) {
    try {
      const device = await adminService.blockDevice(
        request.params.id,
        request.admin.id,
        request.body.reason || 'Admin action',
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(device));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'DEVICE_BLOCK_FAILED'));
    }
  }

  async unlinkDevice(request, reply) {
    try {
      await adminService.unlinkDevice(request.params.id);
      return reply.send(success({ unlinked: true }));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'UNLINK_DEVICE_FAILED'));
    }
  }

  async unblockDevice(request, reply) {
    try {
      const device = await adminService.unblockDevice(
        request.params.id,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(device));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'DEVICE_UNBLOCK_FAILED'));
    }
  }

  async getFeatureFlags(request, reply) {
    try {
      const flags = await adminService.getFeatureFlags();
      return reply.send(success(flags));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'FEATURE_FLAGS_FAILED'));
    }
  }

  async createFeatureFlag(request, reply) {
    try {
      const flag = await adminService.createFeatureFlag(
        request.body,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.code(201).send(success(flag));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'FEATURE_FLAG_CREATE_FAILED'));
    }
  }

  async updateFeatureFlag(request, reply) {
    try {
      const flag = await adminService.updateFeatureFlag(
        request.params.id,
        request.body,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(flag));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'FEATURE_FLAG_UPDATE_FAILED'));
    }
  }

  async toggleFeatureFlag(request, reply) {
    try {
      const flag = await adminService.toggleFeatureFlag(
        request.params.id,
        request.body.enabled,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(flag));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'FEATURE_FLAG_TOGGLE_FAILED'));
    }
  }

  async listSubscriptions(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        status: request.query.status,
        search: request.query.search,
      };
      const subs = await adminService.listSubscriptions(query);
      return reply.send(success(subs));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'LIST_SUBS_FAILED'));
    }
  }

  async updateSubscription(request, reply) {
    try {
      const sub = await adminService.updateSubscription(request.params.id, request.body);
      return reply.send(success(sub));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'UPDATE_SUB_FAILED'));
    }
  }

  async renewSubscription(request, reply) {
    try {
      const sub = await adminService.renewSubscription(request.params.id, request.body);
      return reply.send(success(sub));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'RENEW_SUB_FAILED'));
    }
  }

  async extendSubscription(request, reply) {
    try {
      const sub = await adminService.extendSubscription(request.params.id, request.body);
      return reply.send(success(sub));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'EXTEND_SUB_FAILED'));
    }
  }

  async cancelSubscription(request, reply) {
    try {
      const sub = await adminService.cancelSubscription(request.params.id);
      return reply.send(success(sub));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'CANCEL_SUB_FAILED'));
    }
  }

  async deleteUser(request, reply) {
    try {
      const { tenantId, userId } = request.params;
      await adminService.deleteUser(tenantId, userId);
      return reply.send(success({ deleted: true }));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'DELETE_USER_FAILED'));
    }
  }

  async updateUserStatus(request, reply) {
    try {
      const { tenantId, userId } = request.params;
      const user = await adminService.updateUserStatus(
        tenantId,
        userId,
        request.body.status,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(user));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'UPDATE_USER_STATUS_FAILED'));
    }
  }

  async blockUser(request, reply) {
    try {
      const { tenantId, userId } = request.params;
      const user = await adminService.blockUser(
        tenantId,
        userId,
        request.body.reason || 'Blocked by admin',
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(user));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'BLOCK_USER_FAILED'));
    }
  }

  async unblockUser(request, reply) {
    try {
      const { tenantId, userId } = request.params;
      const user = await adminService.unblockUser(
        tenantId,
        userId,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(user));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'UNBLOCK_USER_FAILED'));
    }
  }

  async listAllUsers(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        status: request.query.status,
        role: request.query.role,
        tenantId: request.query.tenantId,
      };
      const result = await adminService.listAllUsers(query);
      return reply.send(
        success(result.users, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LIST_USERS_FAILED'));
    }
  }

  async resetUserPassword(request, reply) {
    try {
      const result = await adminService.resetUserPassword(
        request.params.tenantId,
        request.params.userId,
      );
      return reply.send(success(result));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'RESET_PASSWORD_FAILED'));
    }
  }

  async resetUserDevice(request, reply) {
    try {
      await adminService.resetUserDevice(request.params.tenantId, request.params.userId);
      return reply.send(success({ reset: true }));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'RESET_DEVICE_FAILED'));
    }
  }

  async listShops(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        status: request.query.status,
        verified: request.query.verified,
      };
      const shops = await adminService.listShops(query);
      return reply.send(success(shops));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'LIST_SHOPS_FAILED'));
    }
  }

  async getShopDetail(request, reply) {
    try {
      const shop = await adminService.getShopDetail(request.params.id);
      return reply.send(success(shop));
    } catch (error) {
      return reply.code(404).send(errorResponse(error.message, 'SHOP_NOT_FOUND'));
    }
  }

  async updateShop(request, reply) {
    try {
      const shop = await adminService.updateShop(request.params.id, request.body);
      return reply.send(success(shop));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'UPDATE_SHOP_FAILED'));
    }
  }

  async approveShop(request, reply) {
    try {
      const shop = await adminService.approveShop(request.params.id);
      return reply.send(success(shop));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'APPROVE_SHOP_FAILED'));
    }
  }

  async suspendShop(request, reply) {
    try {
      const shop = await adminService.suspendShop(request.params.id);
      return reply.send(success(shop));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'SUSPEND_SHOP_FAILED'));
    }
  }

  async blockShop(request, reply) {
    try {
      const shop = await adminService.blockShop(request.params.id, request.body?.reason);
      return reply.send(success(shop));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'BLOCK_SHOP_FAILED'));
    }
  }

  async deleteShop(request, reply) {
    try {
      await adminService.deleteShop(request.params.id);
      return reply.send(success({ deleted: true }));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'DELETE_SHOP_FAILED'));
    }
  }

  async listTenants(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 25,
        search: request.query.search,
        status: request.query.status,
        verified: request.query.verified,
        blacklisted: request.query.blacklisted,
        sortBy: request.query.sortBy || 'createdAt',
        sortOrder: request.query.sortOrder || 'desc',
      };
      const result = await adminService.listTenants(query);
      return reply.send(
        success(result.tenants, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LIST_TENANTS_FAILED'));
    }
  }

  async getTenantDetail(request, reply) {
    try {
      const tenant = await adminService.getTenantDetail(request.params.id);
      return reply.send(success(tenant));
    } catch (error) {
      if (error.message === 'Tenant not found') {
        return reply.code(404).send(errorResponse(error.message, 'TENANT_NOT_FOUND'));
      }
      return reply.code(400).send(errorResponse(error.message, 'TENANT_DETAIL_FAILED'));
    }
  }

  async verifyTenant(request, reply) {
    try {
      const tenant = await adminService.verifyTenant(
        request.params.id,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(tenant));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TENANT_VERIFY_FAILED'));
    }
  }

  async blacklistTenant(request, reply) {
    try {
      const tenant = await adminService.blacklistTenant(
        request.params.id,
        request.body.reason || 'Admin action',
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(tenant));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TENANT_BLACKLIST_FAILED'));
    }
  }

  async unblacklistTenant(request, reply) {
    try {
      const tenant = await adminService.unblacklistTenant(
        request.params.id,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(tenant));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TENANT_UNBLACKLIST_FAILED'));
    }
  }

  async updateTenantStatus(request, reply) {
    try {
      const tenant = await adminService.updateTenantStatus(
        request.params.id,
        request.body.status,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(tenant));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TENANT_STATUS_FAILED'));
    }
  }

  async getDashboardStats(request, reply) {
    try {
      const stats = await adminService.getDashboardStats();
      return reply.send(success(stats));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'DASHBOARD_FAILED'));
    }
  }

  async getDashboardTrends(request, reply) {
    try {
      const trends = await adminService.getDashboardTrends();
      return reply.send(success(trends));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'TRENDS_FAILED'));
    }
  }

  async getExpiringSubscriptions(request, reply) {
    try {
      const days = parseInt(request.query.days) || 7;
      const subscriptions = await adminService.getExpiringSubscriptions(days);
      return reply.send(success(subscriptions));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'EXPIRING_SUBS_FAILED'));
    }
  }

  async getSystemHealth(request, reply) {
    try {
      const health = await adminService.getSystemHealth();
      return reply.send(success(health));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'SYSTEM_HEALTH_FAILED'));
    }
  }

  async listSupportTickets(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        status: request.query.status,
        priority: request.query.priority,
        search: request.query.search,
      };
      const tickets = await adminService.listSupportTickets(query);
      return reply.send(success(tickets));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'LIST_TICKETS_FAILED'));
    }
  }

  async getSupportTicket(request, reply) {
    try {
      const ticket = await adminService.getSupportTicket(request.params.id);
      return reply.send(success(ticket));
    } catch (error) {
      return reply.code(404).send(errorResponse(error.message, 'TICKET_NOT_FOUND'));
    }
  }

  async replySupportTicket(request, reply) {
    try {
      const { id } = request.params;
      const { message } = request.body;
      const adminId = request.admin.id;
      const result = await adminService.replySupportTicket(id, message, adminId);
      return reply.send(success(result));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TICKET_REPLY_FAILED'));
    }
  }

  async updateSupportTicketStatus(request, reply) {
    try {
      const { id } = request.params;
      const { status } = request.body;
      const result = await adminService.updateSupportTicketStatus(id, status);
      return reply.send(success(result));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'TICKET_UPDATE_FAILED'));
    }
  }

  async getExpiryOverview(request, reply) {
    try {
      const overview = await adminService.getExpiryOverview();
      return reply.send(success(overview));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'EXPIRY_OVERVIEW_FAILED'));
    }
  }

  async sendExpiryReminders(request, reply) {
    try {
      const result = await adminService.sendExpiryReminders(request.body);
      return reply.send(success(result));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'EXPIRY_REMINDER_FAILED'));
    }
  }

  async sendBroadcast(request, reply) {
    try {
      const result = await adminService.sendBroadcast(request.body);
      return reply.send(success(result));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'BROADCAST_FAILED'));
    }
  }

  async getRevenueOverview(request, reply) {
    try {
      const overview = await adminService.getRevenueOverview();
      return reply.send(success(overview));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'REVENUE_OVERVIEW_FAILED'));
    }
  }

  async getMonthlyRevenue(request, reply) {
    try {
      const months = parseInt(request.query.months) || 12;
      const data = await adminService.getMonthlyRevenue(months);
      return reply.send(success(data));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'MONTHLY_REVENUE_FAILED'));
    }
  }

  async generateInvoice(request, reply) {
    try {
      const invoice = await adminService.generateInvoice(request.body);
      return reply.send(success(invoice));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'INVOICE_FAILED'));
    }
  }

  async listPayments(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        status: request.query.status,
        from: request.query.from,
        to: request.query.to,
      };
      const result = await adminService.listPayments(query);
      return reply.send(
        success(result.payments, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LIST_PAYMENTS_FAILED'));
    }
  }

  async getPaymentDetail(request, reply) {
    try {
      const payment = await adminService.getPaymentDetail(request.params.id);
      return reply.send(success(payment));
    } catch (error) {
      return reply.code(404).send(errorResponse(error.message, 'PAYMENT_NOT_FOUND'));
    }
  }

  async refundPayment(request, reply) {
    try {
      const payment = await adminService.refundPayment(
        request.params.id,
        request.body.reason || 'Admin initiated refund',
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(payment));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'PAYMENT_REFUND_FAILED'));
    }
  }

  async updatePaymentStatus(request, reply) {
    try {
      const payment = await adminService.updatePaymentStatus(
        request.params.id,
        request.body.status,
        request.admin.id,
        request.ip,
        request.headers['user-agent'],
      );
      return reply.send(success(payment));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'PAYMENT_STATUS_FAILED'));
    }
  }

  async getSecurityOverview(request, reply) {
    try {
      const overview = await adminService.getSecurityOverview();
      return reply.send(success(overview));
    } catch (error) {
      return reply.code(500).send(errorResponse(error.message, 'SECURITY_OVERVIEW_FAILED'));
    }
  }

  async getLatestOtp(request, reply) {
    try {
      const { email } = request.query;
      if (!email) {
        return reply.code(400).send(errorResponse('Email is required', 'MISSING_EMAIL'));
      }
      const log = await adminService.getLatestOtp(email);
      return reply.send(success(log));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LATEST_OTP_FAILED'));
    }
  }

  async getLoginAttempts(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 50,
        outcome: request.query.outcome,
        from: request.query.from,
        to: request.query.to,
      };
      const result = await adminService.getLoginAttempts(query);
      return reply.send(
        success(result.attempts, {
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        }),
      );
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LOGIN_ATTEMPTS_FAILED'));
    }
  }

  async getSecurityAlerts(request, reply) {
    try {
      const alerts = await adminService.getSecurityAlerts();
      return reply.send(success(alerts));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'SECURITY_ALERTS_FAILED'));
    }
  }
}

export default new AdminController();
