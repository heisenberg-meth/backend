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
    '/dashboard/trends',
    { preHandler: [authenticateAdmin] },
    adminController.getDashboardTrends,
  );

  fastify.get(
    '/subscriptions/expiring',
    { preHandler: [authenticateAdmin] },
    adminController.getExpiringSubscriptions,
  );

  fastify.get(
    '/subscriptions',
    { preHandler: [authenticateAdmin] },
    adminController.listSubscriptions,
  );

  fastify.patch(
    '/subscriptions/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateSubscription,
  );

  fastify.post(
    '/subscriptions/:id/renew',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.renewSubscription,
  );

  fastify.post(
    '/subscriptions/:id/extend',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.extendSubscription,
  );

  fastify.post(
    '/subscriptions/:id/cancel',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.cancelSubscription,
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
  fastify.get('/audit-logs', { preHandler: [authenticateAdmin] }, adminController.getAuditLogs);

  fastify.get('/otp-logs', { preHandler: [authenticateAdmin] }, adminController.getOtpLogs);
  fastify.get('/otp/latest', { preHandler: [authenticateAdmin] }, adminController.getLatestOtp);

  // ---- Devices ----
  fastify.get('/devices', { preHandler: [authenticateAdmin] }, adminController.getDevices);

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

  fastify.put(
    '/devices/:id/unlink',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.unlinkDevice,
  );

  // ---- Shop Management ----
  fastify.get('/shops', { preHandler: [authenticateAdmin] }, adminController.listShops);

  fastify.get('/shops/:id', { preHandler: [authenticateAdmin] }, adminController.getShopDetail);

  fastify.patch(
    '/shops/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateShop,
  );

  fastify.post(
    '/shops/:id/approve',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.approveShop,
  );

  fastify.post(
    '/shops/:id/suspend',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.suspendShop,
  );

  fastify.post(
    '/shops/:id/block',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.blockShop,
  );

  fastify.delete(
    '/shops/:id',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.deleteShop,
  );

  // ---- User Management (individual users, not tenants) ----
  fastify.put(
    '/users/:tenantId/users/:userId/status',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateUserStatus,
  );

  fastify.put(
    '/users/:tenantId/users/:userId/block',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.blockUser,
  );

  fastify.put(
    '/users/:tenantId/users/:userId/unblock',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.unblockUser,
  );

  fastify.delete(
    '/users/:tenantId/users/:userId',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.deleteUser,
  );

  fastify.post(
    '/users/:tenantId/users/:userId/reset-password',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.resetUserPassword,
  );

  fastify.post(
    '/users/:tenantId/users/:userId/reset-device',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.resetUserDevice,
  );

  // ---- List all users across all tenants ----
  fastify.get('/users/list-all', { preHandler: [authenticateAdmin] }, adminController.listAllUsers);

  // ---- Tenant / Shop Management ----
  fastify.get('/users', { preHandler: [authenticateAdmin] }, adminController.listTenants);

  fastify.get('/users/:id', { preHandler: [authenticateAdmin] }, adminController.getTenantDetail);

  fastify.put(
    '/users/:id/status',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.updateTenantStatus,
  );

  fastify.put(
    '/users/:id/verify',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.verifyTenant,
  );

  fastify.put(
    '/users/:id/blacklist',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.blacklistTenant,
  );

  fastify.put(
    '/users/:id/unblacklist',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.unblacklistTenant,
  );

  // ---- System Health ----
  fastify.get(
    '/system-health',
    { preHandler: [authenticateAdmin] },
    adminController.getSystemHealth,
  );

  // ---- Support Tickets ----
  fastify.get(
    '/support-tickets',
    { preHandler: [authenticateAdmin] },
    adminController.listSupportTickets,
  );

  fastify.get(
    '/support-tickets/:id',
    { preHandler: [authenticateAdmin] },
    adminController.getSupportTicket,
  );

  fastify.post(
    '/support-tickets/:id/reply',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN', 'SUPPORT')] },
    adminController.replySupportTicket,
  );

  fastify.put(
    '/support-tickets/:id/status',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN', 'SUPPORT')] },
    adminController.updateSupportTicketStatus,
  );

  // ---- Expiry Notification Center ----
  fastify.get(
    '/expiry/overview',
    { preHandler: [authenticateAdmin] },
    adminController.getExpiryOverview,
  );

  fastify.post(
    '/expiry/send-reminders',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.sendExpiryReminders,
  );

  // ---- Broadcast Center ----
  fastify.post(
    '/broadcast',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN')] },
    adminController.sendBroadcast,
  );

  // ---- Revenue Dashboard ----
  fastify.get(
    '/revenue/overview',
    { preHandler: [authenticateAdmin] },
    adminController.getRevenueOverview,
  );

  fastify.get(
    '/revenue/monthly',
    { preHandler: [authenticateAdmin] },
    adminController.getMonthlyRevenue,
  );

  // ---- Invoice Generation ----
  fastify.post(
    '/payments/invoice',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN', 'FINANCE')] },
    adminController.generateInvoice,
  );

  // ---- Payment Management ----
  fastify.get('/payments', { preHandler: [authenticateAdmin] }, adminController.listPayments);

  fastify.get(
    '/payments/:id',
    { preHandler: [authenticateAdmin] },
    adminController.getPaymentDetail,
  );

  fastify.put(
    '/payments/:id/refund',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN', 'FINANCE')] },
    adminController.refundPayment,
  );

  fastify.put(
    '/payments/:id/status',
    { preHandler: [authenticateAdmin, requireAdminRole('ROOT_ADMIN', 'ADMIN', 'FINANCE')] },
    adminController.updatePaymentStatus,
  );

  // ---- Security Center ----
  fastify.get(
    '/security/overview',
    { preHandler: [authenticateAdmin] },
    adminController.getSecurityOverview,
  );

  fastify.get(
    '/security/login-attempts',
    { preHandler: [authenticateAdmin] },
    adminController.getLoginAttempts,
  );

  fastify.get(
    '/security/alerts',
    { preHandler: [authenticateAdmin] },
    adminController.getSecurityAlerts,
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
