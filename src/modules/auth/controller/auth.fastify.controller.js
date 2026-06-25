import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import prisma from '../../../config/prisma.js';
import authService from '../service/auth.prisma.service.js';
import authRepository from '../repository/auth.prisma.repository.js';
import emailVerificationService from '../service/email-verification.service.js';

import accountRecoveryService from '../service/account-recovery.service.js';
import deviceManagementService from '../service/device-management.service.js';
import loginHistoryService from '../service/login-history.service.js';
import adminGovernanceService from '../service/admin-governance.service.js';
import ssoService from '../service/sso.service.js';
import apiKeyService from '../service/api-key.service.js';
import complianceService from '../service/compliance.service.js';
import csrfMiddleware from '../middleware/csrf.middleware.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  resendResetOtpSchema,
} from '../validators/auth.validator.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import { RESET_OTP_TEMPLATE } from '../../notifications/templates/email.templates.js';
import otpAuditService from '../../../shared/services/otp-audit.service.js';
import { OTP_EXPIRY_MS, RESEND_COOLDOWN_MS } from '../auth.constants.js';
import { resolvedCookieDomain, REFRESH_COOKIE_OPTIONS } from '../../../config/cookie.config.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import authMetricsService from '../service/auth.metrics.service.js';
import cookieManager from '../../../shared/services/cookie-manager.service.js';

class AuthFastifyController {
  async register(request, reply) {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await authService.register(parsed);

      if (result.refreshToken) {
        cookieManager.setAuthCookies(reply, { refreshToken: result.refreshToken });
      }

      const responsePayload = { ...result };
      delete responsePayload.refreshToken;

      return reply.code(201).send(success(responsePayload));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply
          .code(400)
          .send(
            errorResponse(firstIssue?.message || 'Validation failed', AUTH_ERRORS.VALIDATION_ERROR),
          );
      }
      if (error?.message === 'User already exists') {
        return reply
          .code(409)
          .send(
            errorResponse('An account with this email already exists', AUTH_ERRORS.USER_EXISTS),
          );
      }
      return reply
        .code(400)
        .send(
          errorResponse(error?.message || 'Registration failed', AUTH_ERRORS.REGISTRATION_ERROR),
        );
    }
  }

  async login(request, reply) {
    const startTime = Date.now();
    try {
      request.log.info(
        {
          ip: request.ip,
          forwardedFor: request.headers['x-forwarded-for'],
        },
        'LOGIN ATTEMPT',
      );
      const parsed = loginSchema.parse(request.body);
      const result = await authService.login({
        ...parsed,
        fingerprint: parsed.fingerprint || request.body.fingerprint,
        deviceToken: parsed.deviceToken || request.body.deviceToken,
        otp: parsed.otp || request.body.otp,
        deviceName: request.body.deviceName,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
        headers: request.headers,
      });

      if (result.deviceVerificationRequired || result.twoFactorVerificationRequired) {
        return reply.send(success(result));
      }

      // Set cookies with proper options
      cookieManager.setAuthCookies(reply, {
        refreshToken: result.refreshToken,
        accessToken: result.token,
      });
      csrfMiddleware.setCsrfCookie(reply, csrfMiddleware.generateToken());

      const responsePayload = { ...result };
      delete responsePayload.refreshToken;

      request.log.info(
        {
          userId: result.user?.id,
          hasRefreshToken: !!result.refreshToken,
          hasAccessToken: !!result.token,
        },
        'LOGIN SUCCESS',
      );

      authMetricsService.recordLoginSuccess();
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        userId: result.user?.id,
        tenantId: result.user?.tenantId,
        branchId: result.user?.branchId,
        role: result.user?.role,
        endpoint: '/api/auth/login',
        result: 'SUCCESS',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(success(responsePayload));
    } catch (error) {
      request.log.error(error);

      authMetricsService.recordLoginFailure(
        error?.message === 'Invalid credentials' ? 'invalid_password' : 'other',
      );
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        endpoint: '/api/auth/login',
        result: 'FAILURE',
        errorCode: error?.message || 'UnknownError',
        failureReason: error?.message || 'Invalid login attempt',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply
          .code(400)
          .send(
            errorResponse(firstIssue?.message || 'Validation failed', AUTH_ERRORS.VALIDATION_ERROR),
          );
      }
      if (error?.message === 'Invalid credentials') {
        request.log.warn(
          { event: 'AUTH_LOGIN_FAILURE', email: request.body?.email },
          'Login Failure',
        );
        return reply.code(401).send(errorResponse(error.message, AUTH_ERRORS.INVALID_CREDENTIALS));
      }
      if (error?.message === 'Invalid 2FA code') {
        request.log.warn(
          { event: 'AUTH_LOGIN_FAILURE_2FA', email: request.body?.email },
          'Invalid 2FA code',
        );
        return reply.code(401).send(errorResponse(error.message, AUTH_ERRORS.INVALID_2FA_CODE));
      }
      if (error?.message === 'This browser is already linked to another account') {
        request.log.warn(
          { event: 'AUTH_FINGERPRINT_MISMATCH', email: request.body?.email },
          'Fingerprint Mismatch',
        );
        return reply.code(403).send(errorResponse(error.message, AUTH_ERRORS.BROWSER_LOCKED));
      }
      if (
        error?.message === 'Verification code has expired or is invalid' ||
        error?.message === 'Invalid verification code'
      ) {
        return reply
          .code(400)
          .send(errorResponse(error.message, AUTH_ERRORS.INVALID_VERIFICATION_CODE));
      }
      if (error?.message?.includes('active on another device')) {
        request.log.warn(
          { event: 'AUTH_SESSION_LIMIT', email: request.body?.email },
          'Session Limit Reached',
        );
        return reply.code(403).send(errorResponse(error.message, AUTH_ERRORS.SESSION_LIMIT));
      }
      if (error?.code === AUTH_ERRORS.AUTH_EMAIL_NOT_VERIFIED) {
        request.log.warn(
          { event: 'AUTH_EMAIL_NOT_VERIFIED', email: request.body?.email },
          'Email Not Verified',
        );
        return reply
          .code(403)
          .send(errorResponse(error.message, AUTH_ERRORS.AUTH_EMAIL_NOT_VERIFIED));
      }
      if (
        error?.message?.includes('account has been blocked') ||
        error?.message?.includes('organization has been blocked')
      ) {
        return reply
          .code(403)
          .send(errorResponse(error.message, AUTH_ERRORS.AUTH_ACCOUNT_DISABLED));
      }
      if (error?.message?.includes('account has been suspended')) {
        return reply
          .code(403)
          .send(errorResponse(error.message, AUTH_ERRORS.AUTH_ACCOUNT_DISABLED));
      }

      return reply
        .code(500)
        .send(errorResponse(error?.message || 'Internal server error', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async refreshToken(request, reply) {
    const startTime = Date.now();
    let sessionFound = false;
    let userFound = false;

    try {
      request.log.info(
        {
          hasCookie: !!request.cookies?.refresh_token,
          cookieNames: Object.keys(request.cookies || {}),
          url: request.url,
          method: request.method,
          origin: request.headers.origin,
          referer: request.headers.referer,
        },
        'Refresh request received',
      );

      const refreshToken = request.cookies?.refresh_token;

      if (!refreshToken) {
        request.log.info(
          {
            route: '/auth/refresh',
            cookieReceived: false,
            sessionFound: false,
            userFound: false,
            duration: Date.now() - startTime,
            cookieDomain: resolvedCookieDomain,
            sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
            secure: REFRESH_COOKIE_OPTIONS.secure,
          },
          'Token refresh failed: Missing cookie - check cookie domain and SameSite settings',
        );
        return reply
          .code(401)
          .send(errorResponse('Refresh token required', AUTH_ERRORS.REFRESH_TOKEN_REQUIRED));
      }

      const result = await authService.refreshSession(refreshToken);
      sessionFound = true;
      userFound = true;

      cookieManager.setAuthCookies(reply, {
        refreshToken: result.refreshToken,
        accessToken: result.token,
      });

      const responsePayload = { ...result };
      delete responsePayload.refreshToken;

      request.log.info(
        {
          route: '/auth/refresh',
          cookieReceived: true,
          sessionFound: true,
          userFound: true,
          duration: Date.now() - startTime,
        },
        'Token refresh successful',
      );

      authMetricsService.recordRefreshSuccess();
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        userId: result.user?.id,
        tenantId: result.user?.tenantId,
        branchId: result.user?.branchId,
        role: result.user?.role,
        sessionId: result.id,
        endpoint: '/api/auth/refresh',
        result: 'SUCCESS',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(success(responsePayload));
    } catch (error) {
      request.log.error(error);

      const isReused = error?.message === 'Invalid or reused refresh token';
      authMetricsService.recordRefreshFailure(isReused ? 'replay' : 'expired');
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        endpoint: '/api/auth/refresh',
        result: 'FAILURE',
        errorCode: error?.message || 'RefreshFailed',
        failureReason: isReused ? 'Replay attack detected' : 'Token expired or invalid',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      const isInvalidToken =
        error?.message === 'Invalid refresh token' ||
        error?.message === 'Invalid or reused refresh token' ||
        error?.message === 'Refresh token expired';

      if (!isInvalidToken && error?.message !== 'User not found') {
        sessionFound = true; // Assuming session was found if it failed later
        userFound = error?.message !== 'User not found';
      }

      request.log.info(
        {
          route: '/auth/refresh',
          cookieReceived: true,
          sessionFound,
          userFound,
          duration: Date.now() - startTime,
        },
        'Token refresh failed: ' + error?.message,
      );

      if (isInvalidToken) {
        cookieManager.clearAuthCookies(reply);
        const code =
          error.message === 'Invalid or reused refresh token'
            ? AUTH_ERRORS.REFRESH_TOKEN_REUSED
            : AUTH_ERRORS.REFRESH_INVALID;
        return reply.code(401).send(errorResponse(error.message, code));
      }
      return reply
        .code(401)
        .send(
          errorResponse(error?.message || 'Session refresh failed', AUTH_ERRORS.REFRESH_FAILED),
        );
    }
  }

  async logout(request, reply) {
    const startTime = Date.now();
    try {
      await authService.logout(request.sessionId);

      cookieManager.clearAuthCookies(reply);

      request.log.info(
        {
          userId: request.user?.id,
          sessionId: request.sessionId,
        },
        'LOGOUT SUCCESS',
      );

      authMetricsService.recordLogoutSuccess();
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        userId: request.user?.id,
        tenantId: request.user?.tenantId,
        branchId: request.user?.branchId,
        role: request.user?.role,
        sessionId: request.sessionId,
        endpoint: '/api/auth/logout',
        result: 'SUCCESS',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(success({ message: 'Logged out successfully' }));
    } catch (error) {
      request.log.error(error);

      authMetricsService.recordLogoutFailure();
      authMetricsService.logStructuredAuthEvent({
        requestId: request.id,
        method: request.method,
        endpoint: '/api/auth/logout',
        result: 'FAILURE',
        errorCode: error?.message || 'LogoutFailed',
        failureReason: error?.message || 'Failed to clear session',
        responseTime: Date.now() - startTime,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply
        .code(400)
        .send(errorResponse(error?.message || 'Logout failed', AUTH_ERRORS.LOGOUT_ERROR));
    }
  }

  async logoutAll(request, reply) {
    try {
      await authService.logoutAll(request.user.id);

      cookieManager.clearAuthCookies(reply);

      request.log.info(
        {
          userId: request.user?.id,
        },
        'LOGOUT ALL SUCCESS',
      );

      return reply.send(success({ message: 'All sessions revoked' }));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send(
          errorResponse(
            error?.message || 'Session revocation failed',
            AUTH_ERRORS.LOGOUT_ALL_ERROR,
          ),
        );
    }
  }

  async getSessions(request, reply) {
    try {
      const rawSessions = await authService.getSessions(request.user.id);
      const sessions = rawSessions.map((s) => ({
        ...s,
        isCurrent: s.id === request.sessionId,
      }));
      return reply.send(success({ sessions }));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send(
          errorResponse(error?.message || 'Failed to fetch sessions', AUTH_ERRORS.SESSIONS_ERROR),
        );
    }
  }

  async getCurrentSession(request, reply) {
    try {
      const currentId = request.sessionId;
      if (!currentId) throw new Error('No active session associated with this token');
      const sessions = await authService.getSessions(request.user.id);
      const currentSession = sessions.find((s) => s.id === currentId);
      if (!currentSession) throw new Error('Session not found');
      return reply.send(success({ session: { ...currentSession, isCurrent: true } }));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send(
          errorResponse(
            error?.message || 'Failed to fetch current session',
            AUTH_ERRORS.SESSIONS_ERROR,
          ),
        );
    }
  }

  async revokeSession(request, reply) {
    try {
      const { sessionId } = request.params;
      await authService.revokeSession(sessionId, request.user.id);
      return reply.send(success({ message: 'Session revoked' }));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send(
          errorResponse(error?.message || 'Failed to revoke session', AUTH_ERRORS.REVOKE_ERROR),
        );
    }
  }

  async forgotPassword(request, reply) {
    try {
      const { email } = forgotPasswordSchema.parse(request.body);
      const result = await authService.forgotPassword(email, request.ip);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        return reply
          .code(400)
          .send(
            errorResponse(
              error.issues?.[0]?.message || 'Validation failed',
              AUTH_ERRORS.VALIDATION_ERROR,
            ),
          );
      }
      return reply
        .code(500)
        .send(errorResponse(error?.message || 'Internal server error', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async verifyResetOtp(request, reply) {
    try {
      const { email, otp } = verifyResetOtpSchema.parse(request.body);
      const result = await authService.verifyResetOtp(email, otp, request.ip);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        return reply
          .code(400)
          .send(
            errorResponse(
              error.issues?.[0]?.message || 'Validation failed',
              AUTH_ERRORS.VALIDATION_ERROR,
            ),
          );
      }
      const code = error.code || AUTH_ERRORS.INVALID_OTP;
      const status = code === AUTH_ERRORS.OTP_LOCKED ? 429 : 400;
      return reply.code(status).send(errorResponse(error?.message || 'Verification failed', code));
    }
  }

  async resetPassword(request, reply) {
    try {
      const { resetToken, newPassword } = resetPasswordSchema.parse(request.body);
      const result = await authService.resetPassword(resetToken, newPassword);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        return reply
          .code(400)
          .send(
            errorResponse(
              error.issues?.[0]?.message || 'Validation failed',
              AUTH_ERRORS.VALIDATION_ERROR,
            ),
          );
      }
      const code = error.code || AUTH_ERRORS.INVALID_RESET_TOKEN;
      return reply.code(400).send(errorResponse(error?.message || 'Password reset failed', code));
    }
  }

  async resendResetOtp(request, reply) {
    try {
      const { email } = resendResetOtpSchema.parse(request.body);

      const user = await authRepository.findUserByEmail(email);

      if (user) {
        if (user.resetOtpLastSentAt) {
          const elapsed = Date.now() - new Date(user.resetOtpLastSentAt).getTime();
          const remaining = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
          if (elapsed < RESEND_COOLDOWN_MS) {
            return reply
              .code(429)
              .send(
                errorResponse(
                  `Please wait ${remaining} seconds before requesting a new OTP.`,
                  AUTH_ERRORS.RESEND_COOLDOWN,
                ),
              );
          }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await bcrypt.hash(otp, 12);

        await prisma.user.update({
          where: { email },
          data: {
            resetOtp: hashedOtp,
            resetOtpExpiry: new Date(Date.now() + OTP_EXPIRY_MS),
            resetOtpVerified: false,
            resetOtpAttempts: 0,
            resetOtpLastSentAt: new Date(),
            resetToken: null,
            resetTokenExpiry: null,
          },
        });

        await queueEmail(email, 'Resend Password Reset OTP', RESET_OTP_TEMPLATE(otp));

        otpAuditService.logOtpGenerated({
          userId: user.id,
          email,
          otp,
          purpose: 'PASSWORD_RESET',
          channel: 'EMAIL',
          ipAddress: request.ip,
          expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        });
      }

      return reply.send(
        success({
          message: 'If the account exists, a recovery code has been sent.',
        }),
      );
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply
          .code(400)
          .send(
            errorResponse(firstIssue?.message || 'Validation failed', AUTH_ERRORS.VALIDATION_ERROR),
          );
      }
      return reply
        .code(500)
        .send(errorResponse(error?.message || 'Internal server error', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async updateProfile(request, reply) {
    try {
      const result = await authService.updateProfile(request.user.id, request.body);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(400)
        .send(
          errorResponse(
            error?.message || 'Profile update failed',
            AUTH_ERRORS.PROFILE_UPDATE_ERROR,
          ),
        );
    }
  }

  async changePassword(request, reply) {
    try {
      const { currentPassword, newPassword } = request.body;
      if (!currentPassword || !newPassword) {
        return reply
          .code(400)
          .send(
            errorResponse(
              'Current password and new password are required',
              AUTH_ERRORS.VALIDATION_ERROR,
            ),
          );
      }

      const result = await authService.changePassword(
        request.user.id,
        currentPassword,
        newPassword,
      );
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const code = error.code || AUTH_ERRORS.PASSWORD_CHANGE_ERROR;
      const status = code === AUTH_ERRORS.INVALID_PASSWORD ? 401 : 400;
      return reply
        .code(status)
        .send(errorResponse(error?.message || 'Password change failed', code));
    }
  }

  async verifyEmail(request, reply) {
    try {
      const { token } = request.body || {};
      const result = await emailVerificationService.verifyEmail(token);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const code = error.code || AUTH_ERRORS.INVALID_VERIFICATION_TOKEN;
      return reply
        .code(400)
        .send(errorResponse(error?.message || 'Email verification failed', code));
    }
  }

  async resendVerification(request, reply) {
    try {
      const { email } = request.body || {};
      if (!email) {
        return reply
          .code(400)
          .send(errorResponse('Email is required', AUTH_ERRORS.VALIDATION_ERROR));
      }
      const origin = request.headers.origin || 'http://localhost:5173';
      const result = await emailVerificationService.resendVerification(email, origin);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const code = error.code || AUTH_ERRORS.INTERNAL_ERROR;
      const status = code === AUTH_ERRORS.EMAIL_ALREADY_VERIFIED ? 400 : 500;
      return reply
        .code(status)
        .send(errorResponse(error?.message || 'Failed to resend verification', code));
    }
  }

  async requestEmailChange(request, reply) {
    try {
      const { newEmail, currentPassword } = request.body || {};
      if (!newEmail || !currentPassword) {
        return reply
          .code(400)
          .send(
            errorResponse(
              'New email and current password are required',
              AUTH_ERRORS.VALIDATION_ERROR,
            ),
          );
      }
      const origin = request.headers.origin || 'http://localhost:5173';
      const result = await emailVerificationService.requestEmailChange(
        request.user.id,
        newEmail,
        currentPassword,
        origin,
      );
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const code = error.code || AUTH_ERRORS.INTERNAL_ERROR;
      const status = code === AUTH_ERRORS.INVALID_PASSWORD ? 401 : 400;
      return reply
        .code(status)
        .send(errorResponse(error?.message || 'Failed to request email change', code));
    }
  }

  async verifyEmailChange(request, reply) {
    try {
      const { token } = request.body || {};
      const result = await emailVerificationService.verifyEmailChange(token);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const code = error.code || AUTH_ERRORS.INVALID_VERIFICATION_TOKEN;
      return reply
        .code(400)
        .send(errorResponse(error?.message || 'Email change verification failed', code));
    }
  }

  // --- Account Recovery Suite ---
  async requestRecovery(request, reply) {
    const { email, password, reason, identityData } = request.body || {};
    if (!email || !password) {
      return reply
        .code(400)
        .send(errorResponse('Email and password are required', AUTH_ERRORS.VALIDATION_ERROR));
    }
    try {
      const result = await accountRecoveryService.requestRecovery({
        email,
        password,
        reason,
        identityData,
      });
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const status = error?.code === AUTH_ERRORS.AUTH_INVALID_CREDENTIALS ? 401 : 400;
      return reply
        .code(status)
        .send(
          errorResponse(
            error?.message || 'Failed to submit recovery request',
            error?.code || AUTH_ERRORS.INTERNAL_ERROR,
          ),
        );
    }
  }

  async getPendingRecovery(request, reply) {
    try {
      const tenantId = request.user?.tenantId;
      const result = await accountRecoveryService.getPendingRecoveryRequests(tenantId);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(500)
        .send(
          errorResponse(
            error?.message || 'Failed to fetch recovery requests',
            AUTH_ERRORS.INTERNAL_ERROR,
          ),
        );
    }
  }

  async approveRecovery(request, reply) {
    const { requestId, adminNotes } = request.body || {};
    if (!requestId) {
      return reply
        .code(400)
        .send(errorResponse('requestId is required', AUTH_ERRORS.VALIDATION_ERROR));
    }
    try {
      const result = await accountRecoveryService.approveRecoveryRequest({
        requestId,
        adminId: request.user.id,
        adminNotes,
      });
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const status = error?.code === AUTH_ERRORS.AUTH_RECOVERY_NOT_FOUND ? 404 : 400;
      return reply
        .code(status)
        .send(
          errorResponse(
            error?.message || 'Failed to approve recovery',
            error?.code || AUTH_ERRORS.INTERNAL_ERROR,
          ),
        );
    }
  }

  async rejectRecovery(request, reply) {
    const { requestId, adminNotes } = request.body || {};
    if (!requestId) {
      return reply
        .code(400)
        .send(errorResponse('requestId is required', AUTH_ERRORS.VALIDATION_ERROR));
    }
    try {
      const result = await accountRecoveryService.rejectRecoveryRequest({
        requestId,
        adminId: request.user.id,
        adminNotes,
      });
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const status = error?.code === AUTH_ERRORS.AUTH_RECOVERY_NOT_FOUND ? 404 : 400;
      return reply
        .code(status)
        .send(
          errorResponse(
            error?.message || 'Failed to reject recovery',
            error?.code || AUTH_ERRORS.INTERNAL_ERROR,
          ),
        );
    }
  }

  // --- Device Management API ---
  async getUserDevices(request, reply) {
    try {
      const result = await deviceManagementService.getUserDevices(request.user.id);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(500)
        .send(errorResponse('Failed to fetch devices', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async revokeDevice(request, reply) {
    const { deviceId } = request.params;
    try {
      const result = await deviceManagementService.revokeDevice(request.user.id, deviceId);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      const status = error?.message === 'Device not found' ? 404 : 400;
      return reply
        .code(status)
        .send(
          errorResponse(error?.message || 'Failed to revoke device', AUTH_ERRORS.INTERNAL_ERROR),
        );
    }
  }

  // --- Login History & Forensics ---
  async getLoginHistory(request, reply) {
    try {
      const result = await loginHistoryService.getLoginHistory({
        userId: request.user.id,
        limit: 50,
      });
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      return reply
        .code(500)
        .send(errorResponse('Failed to fetch login history', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async getTenantPolicy(request, reply) {
    try {
      const policy = await adminGovernanceService.getTenantAuthPolicy(request.user.tenantId);
      return reply.send(success(policy));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async updateTenantPolicy(request, reply) {
    try {
      if (request.user.role !== 'ADMIN' && request.user.role !== 'OWNER') {
        return reply.code(403).send(errorResponse('Forbidden', AUTH_ERRORS.AUTH_UNAUTHORIZED));
      }
      const updated = await adminGovernanceService.updateTenantAuthPolicy(
        request.user.tenantId,
        request.body,
      );
      return reply.send(success(updated));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async adminForceResetPassword(request, reply) {
    try {
      if (request.user.role !== 'ADMIN' && request.user.role !== 'OWNER') {
        return reply.code(403).send(errorResponse('Forbidden', AUTH_ERRORS.AUTH_UNAUTHORIZED));
      }
      const { userId } = request.params;
      const res = await adminGovernanceService.adminForcePasswordReset({
        adminUserId: request.user.id,
        targetUserId: userId,
        tenantId: request.user.tenantId,
      });
      return reply.send(success(res));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async adminTerminateSessions(request, reply) {
    try {
      if (request.user.role !== 'ADMIN' && request.user.role !== 'OWNER') {
        return reply.code(403).send(errorResponse('Forbidden', AUTH_ERRORS.AUTH_UNAUTHORIZED));
      }
      const { userId } = request.params;
      const res = await adminGovernanceService.adminTerminateUserSessions({
        adminUserId: request.user.id,
        targetUserId: userId,
        tenantId: request.user.tenantId,
      });
      return reply.send(success(res));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async ssoAuthorize(request, reply) {
    try {
      const { provider } = request.params;
      const { redirectUri, tenantId } = request.query;
      const url = ssoService.getAuthorizationUrl({ provider, tenantId, redirectUri });
      return reply.send(success({ url }));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async ssoCallback(request, reply) {
    try {
      const { provider } = request.params;
      const { code, state } = request.body;
      const result = await ssoService.handleCallback({
        provider,
        code,
        statePayload: state,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      cookieManager.setAuthCookies(reply, {
        refreshToken: result.refreshToken,
        accessToken: result.token,
      });
      csrfMiddleware.setCsrfCookie(reply, csrfMiddleware.generateToken());

      const payload = { ...result };
      delete payload.refreshToken;
      return reply.send(success(payload));
    } catch (error) {
      request.log.error(error);
      return reply.code(401).send(errorResponse(error.message, AUTH_ERRORS.AUTH_UNAUTHORIZED));
    }
  }

  // --- PHASE 5: COMPLIANCE, OPERATIONS & RESILIENCY ---

  async createApiKey(request, reply) {
    try {
      const { name, scopes, expiresInDays } = request.body;
      const result = await apiKeyService.createApiKey({
        userId: request.user.id,
        tenantId: request.user.tenantId,
        name,
        scopes,
        expiresInDays,
      });
      return reply.code(201).send(success(result));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async listApiKeys(request, reply) {
    try {
      const keys = await apiKeyService.listUserApiKeys(request.user.id);
      return reply.send(success(keys));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async revokeApiKey(request, reply) {
    try {
      const { keyId } = request.params;
      const res = await apiKeyService.revokeApiKey({ userId: request.user.id, keyId });
      return reply.send(success(res));
    } catch (error) {
      request.log.error(error);
      return reply.code(404).send(errorResponse(error.message, AUTH_ERRORS.USER_NOT_FOUND));
    }
  }

  async exportGdprData(request, reply) {
    try {
      const exportPackage = await complianceService.exportUserData(request.user.id);
      return reply.send(success(exportPackage));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async deleteGdprData(request, reply) {
    try {
      const { reason } = request.body || {};
      const res = await complianceService.deleteUserData({
        userId: request.user.id,
        tenantId: request.user.tenantId,
        reason,
      });
      return reply.send(success(res));
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send(errorResponse(error.message, AUTH_ERRORS.INTERNAL_ERROR));
    }
  }

  async getMe(request, reply) {
    try {
      const result = await authService.getMe(request.user.id);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error?.message === 'User not found') {
        return reply.code(404).send(errorResponse(error.message, AUTH_ERRORS.USER_NOT_FOUND));
      }
      return reply
        .code(500)
        .send(errorResponse(error?.message || 'Internal server error', AUTH_ERRORS.INTERNAL_ERROR));
    }
  }
}

export default new AuthFastifyController();
