import adminController from '../controller/admin.controller.js';
import { authenticateAdmin, requireAdminRole } from '../middleware/admin.auth.middleware.js';

async function adminRoutes(fastify) {
  // ---- Public (no auth) ----
  fastify.post('/login', adminController.login);
  fastify.post('/refresh', adminController.refresh);
  fastify.post('/logout', adminController.logout);

  // ---- Authenticated admin ----
  fastify.get('/me', { preHandler: [authenticateAdmin] }, adminController.me);

  // ---- Dashboard ----
  fastify.get(
    '/dashboard/stats',
    { preHandler: [authenticateAdmin] },
    adminController.getDashboardStats,
  );

  fastify.get(
    '/subscriptions/expiring',
    { preHandler: [authenticateAdmin] },
    adminController.getExpiringSubscriptions,
  );

  // ---- Admin User Management (ROOT_ADMIN only) ----
  fastify.get(
    '/admins',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN')] },
    adminController.listAdmins,
  );

  fastify.post(
    '/admins',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN')] },
    adminController.createAdmin,
  );

  fastify.put(
    '/admins/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN')] },
    adminController.updateAdmin,
  );

  fastify.delete(
    '/admins/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN')] },
    adminController.deleteAdmin,
  );

  // ---- Audit Logs ----
  fastify.get(
    '/audit-logs',
    { preHandler: [authenticateAdmin] },
    adminController.getAuditLogs,
  );

  // ---- Devices ----
  fastify.get(
    '/devices',
    { preHandler: [authenticateAdmin] },
    adminController.getDevices,
  );

  fastify.put(
    '/devices/:id/block',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.blockDevice,
  );

  fastify.put(
    '/devices/:id/unblock',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.unblockDevice,
  );

  // ---- Tenant / User Management ----
  fastify.get(
    '/users',
    { preHandler: [authenticateAdmin] },
    adminController.listTenants,
  );

  fastify.put(
    '/users/:id/status',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateTenantStatus,
  );

  // ---- Feature Flags ----
  fastify.get(
    '/feature-flags',
    { preHandler: [authenticateAdmin] },
    adminController.getFeatureFlags,
  );

  fastify.post(
    '/feature-flags',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.createFeatureFlag,
  );

  fastify.put(
    '/feature-flags/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateFeatureFlag,
  );

  fastify.put(
    '/feature-flags/:id/toggle',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.toggleFeatureFlag,
  );
}

export default adminRoutes;
