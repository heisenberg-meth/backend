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

  fastify.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 hour',
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
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
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
            newPassword: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    authController.changePassword,
  );
}

export default authRoutes;
