import { ZodError } from 'zod';
import { adminService } from '../service/admin.service.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';
import {
  adminLoginSchema,
  adminRefreshSchema,
  adminCreateSchema,
  adminUpdateSchema,
  adminListQuerySchema,
  auditLogQuerySchema,
} from '../validators/admin.validator.js';

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  partitioned: true,
  maxAge: 30 * 24 * 60 * 60,
};

const ACCESS_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  partitioned: true,
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

      return reply.send(success({
        admin: result.admin,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
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

      return reply.send(success({
        admin: result.admin,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      }));
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
      return reply.send(success(result.admins, { pagination: {
        total: result.total, page: result.page,
        limit: result.limit, totalPages: result.totalPages,
      }}));
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
      return reply.send(success(result.logs, { pagination: {
        total: result.total, page: result.page,
        limit: result.limit, totalPages: result.totalPages,
      }}));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'AUDIT_LOGS_FAILED'));
    }
  }

  async getDevices(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        isBlocked: request.query.isBlocked === 'true' ? true : request.query.isBlocked === 'false' ? false : undefined,
        minRiskScore: request.query.minRiskScore ? parseInt(request.query.minRiskScore) : undefined,
        sortBy: request.query.sortBy || 'lastSeen',
        sortOrder: request.query.sortOrder || 'desc',
      };
      const result = await adminService.getDevices(query);
      return reply.send(success(result.devices, { pagination: {
        total: result.total, page: result.page,
        limit: result.limit, totalPages: result.totalPages,
      }}));
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

  async listTenants(request, reply) {
    try {
      const query = {
        page: parseInt(request.query.page) || 1,
        limit: parseInt(request.query.limit) || 20,
        search: request.query.search,
        status: request.query.status,
        sortBy: request.query.sortBy || 'createdAt',
        sortOrder: request.query.sortOrder || 'desc',
      };
      const result = await adminService.listTenants(query);
      return reply.send(success(result.tenants, { pagination: {
        total: result.total, page: result.page,
        limit: result.limit, totalPages: result.totalPages,
      }}));
    } catch (error) {
      return reply.code(400).send(errorResponse(error.message, 'LIST_TENANTS_FAILED'));
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
      return reply.code(500).send(errorResponse(error.message, 'DASHBOARD_STATS_FAILED'));
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
}

export default new AdminController();
