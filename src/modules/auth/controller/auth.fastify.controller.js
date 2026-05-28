import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import prisma from '../../../config/prisma.js';
import authService from '../service/auth.prisma.service.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from '../service/session.service.js';
import secretManager from '../../../config/secrets.js';
import { registerSchema, loginSchema, forgotPasswordSchema, verifyResetOtpSchema, resetPasswordSchema, resendResetOtpSchema } from '../validators/auth.validator.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import { RESET_OTP_TEMPLATE } from '../../notifications/templates/email.templates.js';
import { OTP_EXPIRY_MS, RESEND_COOLDOWN_MS, MAX_OTP_ATTEMPTS, RESET_TOKEN_EXPIRY_MS } from '../auth.constants.js';

const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  maxAge: 30 * 24 * 60 * 60,
};

class AuthFastifyController {
  async register(request, reply) {
    try {
      const parsed = registerSchema.parse(request.body);
      const result = await authService.register(parsed);

      if (result.refreshToken) {
        reply.setCookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
      }

      return reply.code(201).send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      if (error?.message === 'User already exists') {
        return reply.code(409).send(errorResponse(error.message, 'USER_EXISTS'));
      }
      return reply.code(400).send(errorResponse(error?.message || 'Registration failed', 'REGISTRATION_ERROR'));
    }
  }

  async login(request, reply) {
    try {
      const parsed = loginSchema.parse(request.body);
      const result = await authService.login({
        ...parsed,
        fingerprint: request.body.fingerprint,
        deviceName: request.body.deviceName,
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });

      reply.setCookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      if (error?.message === 'Invalid credentials') {
        return reply.code(401).send(errorResponse(error.message, 'INVALID_CREDENTIALS'));
      }
      if (error?.message?.includes('active on another device')) {
        return reply.code(403).send(errorResponse(error.message, 'SESSION_LIMIT'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
    }
  }

  async refreshToken(request, reply) {
    try {
      const refreshToken = request.cookies?.refreshToken || request.body?.refreshToken;
      if (!refreshToken) {
        return reply.code(401).send(errorResponse('Refresh token required', 'REFRESH_TOKEN_REQUIRED'));
      }

      const result = await authService.refreshSession(refreshToken);

      reply.setCookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error?.message === 'Invalid refresh token' || error?.message === 'Refresh token expired') {
        reply.clearCookie('refreshToken', { path: '/' });
        return reply.code(401).send(errorResponse(error.message, 'REFRESH_INVALID'));
      }
      return reply.code(401).send(errorResponse(error?.message || 'Session refresh failed', 'REFRESH_FAILED'));
    }
  }

  async logout(request, reply) {
    try {
      const sessionId = request.headers['x-session-id'];
      await authService.logout(sessionId);

      reply.clearCookie('refreshToken', { path: '/' });
      return reply.send(success({ message: 'Logged out successfully' }));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error?.message || 'Logout failed', 'LOGOUT_ERROR'));
    }
  }

  async logoutAll(request, reply) {
    try {
      await authService.logoutAll(request.user.id);

      reply.clearCookie('refreshToken', { path: '/' });
      return reply.send(success({ message: 'All sessions revoked' }));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error?.message || 'Session revocation failed', 'LOGOUT_ALL_ERROR'));
    }
  }

  async getSessions(request, reply) {
    try {
      const sessions = await authService.getSessions(request.user.id);
      return reply.send(success({ sessions }));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error?.message || 'Failed to fetch sessions', 'SESSIONS_ERROR'));
    }
  }

  async revokeSession(request, reply) {
    try {
      const { sessionId } = request.params;
      await authService.revokeSession(sessionId, request.user.id);
      return reply.send(success({ message: 'Session revoked' }));
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send(errorResponse(error?.message || 'Failed to revoke session', 'REVOKE_ERROR'));
    }
  }

  async forgotPassword(request, reply) {
    try {
      const { email } = forgotPasswordSchema.parse(request.body);

      const user = await authRepository.findUserByEmail(email);

      if (user) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

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

        await queueEmail(email, 'Password Reset OTP', RESET_OTP_TEMPLATE(otp));
      }

      return reply.send(success({
        message: 'If the account exists, a recovery code has been sent.',
      }));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
    }
  }

  async verifyResetOtp(request, reply) {
    try {
      const { email, otp } = verifyResetOtpSchema.parse(request.body);

      const user = await authRepository.findUserByEmail(email);
      if (!user || !user.resetOtp) {
        return reply.send(success({ message: 'OTP verified successfully' }));
      }

      if (user.resetOtpAttempts >= MAX_OTP_ATTEMPTS) {
        return reply.code(429).send(errorResponse('Too many failed attempts. Request a new OTP.', 'OTP_LOCKED'));
      }

      if (new Date() > user.resetOtpExpiry) {
        return reply.code(400).send(errorResponse('OTP has expired', 'OTP_EXPIRED'));
      }

      const isMatch = await bcrypt.compare(otp, user.resetOtp);
      if (!isMatch) {
        await prisma.user.update({
          where: { email },
          data: { resetOtpAttempts: { increment: 1 } },
        });
        return reply.code(400).send(errorResponse('Invalid OTP', 'INVALID_OTP'));
      }

      const resetToken = jwt.sign(
        { type: 'password-reset', userId: user.id },
        secretManager.getPrimarySecret(),
        { expiresIn: '5m', algorithm: 'HS256' },
      );

      await prisma.user.update({
        where: { email },
        data: {
          resetOtpVerified: true,
          resetToken,
          resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
        },
      });

      return reply.send(success({
        message: 'OTP verified successfully',
        resetToken,
      }));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
    }
  }

  async resetPassword(request, reply) {
    try {
      const { resetToken, newPassword } = resetPasswordSchema.parse(request.body);

      let payload;
      try {
        payload = jwt.verify(resetToken, secretManager.getPrimarySecret());
      } catch {
        return reply.code(400).send(errorResponse('Invalid or expired reset token.', 'INVALID_RESET_TOKEN'));
      }

      if (payload.type !== 'password-reset' || !payload.userId) {
        return reply.code(400).send(errorResponse('Invalid reset token.', 'INVALID_RESET_TOKEN'));
      }

      const user = await authRepository.findUserById(payload.userId);
      if (!user || !user.resetOtpVerified) {
        return reply.send(success({ message: 'Password reset successful' }));
      }

      if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
        return reply.code(400).send(errorResponse('Reset session expired. Request a new OTP.', 'RESET_SESSION_EXPIRED'));
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetOtp: null,
          resetOtpExpiry: null,
          resetOtpVerified: false,
          resetOtpAttempts: 0,
          resetOtpLastSentAt: null,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      await sessionService.revokeAllUserSessions(user.id);

      return reply.send(success({ message: 'Password reset successful' }));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
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
            return reply.code(429).send(errorResponse(
              `Please wait ${remaining} seconds before requesting a new OTP.`,
              'RESEND_COOLDOWN',
            ));
          }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = await bcrypt.hash(otp, 10);

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
      }

      return reply.send(success({
        message: 'If the account exists, a recovery code has been sent.',
      }));
    } catch (error) {
      request.log.error(error);
      if (error instanceof ZodError) {
        const firstIssue = error.issues?.[0];
        return reply.code(400).send(errorResponse(firstIssue?.message || 'Validation failed', 'VALIDATION_ERROR'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
    }
  }

  async getMe(request, reply) {
    try {
      const result = await authService.getMe(request.user.id);
      return reply.send(success(result));
    } catch (error) {
      request.log.error(error);
      if (error?.message === 'User not found') {
        return reply.code(404).send(errorResponse(error.message, 'USER_NOT_FOUND'));
      }
      return reply.code(500).send(errorResponse(error?.message || 'Internal server error', 'INTERNAL_ERROR'));
    }
  }
}

export default new AuthFastifyController();
