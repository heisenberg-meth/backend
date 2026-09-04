import authController from '../controller/auth.fastify.controller.js';
import { authenticate } from '../../../middleware/auth.fastify.js';

async function authRoutes(fastify) {
  fastify.post(
    '/forgot-password',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Request password reset OTP',
      },
    },
    authController.forgotPassword,
  );

  fastify.post(
    '/verify-reset-otp',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Verify OTP for password reset',
      },
    },
    authController.verifyResetOtp,
  );

  fastify.post(
    '/reset-password',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset password after OTP verification',
      },
    },
    authController.resetPassword,
  );

  fastify.post(
    '/resend-reset-otp',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Resend password reset OTP',
      },
    },
    authController.resendResetOtp,
  );

  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get current user profile',
      },
    },
    authController.getMe,
  );

  fastify.put(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Update current user profile',
      },
    },
    authController.updateProfile,
  );

  fastify.get(
    '/plans',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get active subscription plans',
      },
    },
    authController.getPlans,
  );

  fastify.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user (PostgreSQL)',
      },
    },
    authController.register,
  );

  fastify.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Login user (PostgreSQL) with device fingerprint',
      },
    },
    authController.login,
  );

  fastify.post(
    '/refresh',
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: '1 minute',
        },
      },
      schema: {
        tags: ['Auth'],
        summary: 'Refresh access token',
      },
    },
    authController.refreshToken,
  );

  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Logout and revoke current session',
      },
    },
    authController.logout,
  );

  fastify.post(
    '/logout/all',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Logout from all devices',
      },
    },
    authController.logoutAll,
  );

  fastify.get(
    '/sessions/current',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get current session details',
      },
    },
    authController.getCurrentSession,
  );

  fastify.get(
    '/sessions',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'List all active sessions',
      },
    },
    authController.getSessions,
  );

  fastify.delete(
    '/sessions/:sessionId',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Revoke a specific session',
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    authController.revokeSession,
  );

  fastify.put(
    '/change-password',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Change password for authenticated user',
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: {
              type: 'string',
              minLength: 8,
              pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{8,}$',
            },
          },
        },
      },
    },
    authController.changePassword,
  );

  // ── Enterprise PRD Standardized Aliases ────────────────────────────────
  fastify.post('/logout-all', { preHandler: [authenticate] }, authController.logoutAll);
  fastify.get('/session', { preHandler: [authenticate] }, authController.getCurrentSession);
  fastify.post('/change-password', { preHandler: [authenticate] }, authController.changePassword);
  fastify.post('/change-email', { preHandler: [authenticate] }, authController.requestEmailChange);
  fastify.post('/confirm-email-change', authController.verifyEmailChange);
  fastify.post('/recovery/request', authController.requestRecovery);
  fastify.get('/admin/recovery', { preHandler: [authenticate] }, authController.getPendingRecovery);
  fastify.post(
    '/admin/recovery/approve',
    { preHandler: [authenticate] },
    authController.approveRecovery,
  );
  fastify.post(
    '/admin/recovery/reject',
    { preHandler: [authenticate] },
    authController.rejectRecovery,
  );

  // ── Device Management API ──────────────────────────────────────────────
  fastify.get('/devices', { preHandler: [authenticate] }, authController.getUserDevices);
  fastify.delete('/devices/:deviceId', { preHandler: [authenticate] }, authController.revokeDevice);

  // ── Login History & Forensics ──────────────────────────────────────────
  fastify.get('/login-history', { preHandler: [authenticate] }, authController.getLoginHistory);
  fastify.post(
    '/sessions/:sessionId/revoke',
    { preHandler: [authenticate] },
    authController.revokeSession,
  );

  // ── Phase 4: Enterprise Administration & SSO ───────────────────────────
  fastify.get('/tenant/policy', { preHandler: [authenticate] }, authController.getTenantPolicy);
  fastify.put('/tenant/policy', { preHandler: [authenticate] }, authController.updateTenantPolicy);
  fastify.post(
    '/admin/users/:userId/force-reset-password',
    { preHandler: [authenticate] },
    authController.adminForceResetPassword,
  );
  fastify.post(
    '/admin/users/:userId/terminate-sessions',
    { preHandler: [authenticate] },
    authController.adminTerminateSessions,
  );
  fastify.get('/sso/:provider/authorize', authController.ssoAuthorize);
  fastify.post('/sso/:provider/callback', authController.ssoCallback);

  // ── Phase 5: Compliance, Operations & Resiliency ───────────────────────
  fastify.post('/api-keys', { preHandler: [authenticate] }, authController.createApiKey);
  fastify.get('/api-keys', { preHandler: [authenticate] }, authController.listApiKeys);
  fastify.delete('/api-keys/:keyId', { preHandler: [authenticate] }, authController.revokeApiKey);
  fastify.get('/compliance/export', { preHandler: [authenticate] }, authController.exportGdprData);
  fastify.post(
    '/compliance/erasure',
    { preHandler: [authenticate] },
    authController.deleteGdprData,
  );
}

export default authRoutes;
