import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from './session.service.js';
import { JWT_CONFIG } from '../../../config/jwt.config.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';
import { TRIAL_DAYS } from '../../subscriptions/subscription.constants.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import otpAuditService from '../../../shared/services/otp-audit.service.js';
import MediaService from '../../../shared/services/media.service.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';
import tokenService from './token.service.js';
import emailVerificationService from './email-verification.service.js';
import loginHistoryService from './login-history.service.js';
import securityEngineService from './security-engine.service.js';
import secretManager from '../../../config/secrets.js';
import { RESET_OTP_TEMPLATE } from '../../notifications/templates/email.templates.js';
import PasswordService from './password.service.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import { OTP_EXPIRY_MS, RESET_TOKEN_EXPIRY_MS, MAX_OTP_ATTEMPTS } from '../auth.constants.js';

class AuthPrismaService {
  async register(userData) {
    const email = userData.email.toLowerCase().trim();
    const { password, fullName, shopName, branchName, fingerprint } = userData;

    if (fingerprint) {
      const fingerprintId = sessionService.hashFingerprint(fingerprint);
      if (fingerprintId) {
        const existingLock = await prisma.browserLock.findUnique({
          where: { fingerprintId },
        });
        if (existingLock) {
          throw new Error('This browser is already linked to another account');
        }
      }
    }

    const existingUser = await authRepository.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    const { user, registeredDeviceToken } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          email,
          name: shopName,
        },
      });

      const branchCode = `BR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const branch = await tx.branch.create({
        data: {
          name: branchName || 'Main Branch',
          tenantId: tenant.id,
          code: branchCode,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName,
          role: 'OWNER',
          status: 'UNVERIFIED',
          tenantId: tenant.id,
          branchId: branch.id,
        },
      });

      let registeredDeviceToken = null;
      if (fingerprint) {
        const fingerprintId = sessionService.hashFingerprint(fingerprint);
        if (fingerprintId) {
          registeredDeviceToken = crypto.randomUUID();
          await tx.device.create({
            data: {
              userId: user.id,
              fingerprintId,
              deviceToken: registeredDeviceToken,
            },
          });
          await tx.browserLock.create({
            data: {
              fingerprintId,
              userId: user.id,
            },
          });
        }
      }

      await tx.subscriptionPlan.upsert({
        where: { id: 'free-trial' },
        update: {},
        create: {
          id: 'free-trial',
          name: 'Free Trial',
          price: 0,
          billingCycle: 'MONTHLY',
          features: ['28-day free trial', 'Full feature access'],
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: 'free-trial',
          status: 'TRIAL',
          startDate: trialStart,
          endDate: trialEnd,
          autoRenew: false,
        },
      });

      return { user, branch, registeredDeviceToken };
    });

    try {
      emailVerificationService.sendVerificationEmail(user.id, user.email).catch((err) => {
        logger.warn({ err: err?.message }, '[AUTH] Failed to trigger verification email');
      });
      await eventBus.publish('USER_REGISTERED', {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: user.avatar,
      });
    } catch (eventError) {
      logger.warn({ err: eventError?.message }, '[AUTH] Event bus publish failed (non-critical)');
    }

    const { mainQueue } = await import('../../../queue/index.js');
    await mainQueue.add('subscription-trial-started', { tenantId: user.tenantId });

    return {
      message: 'User registered successfully',
      userId: user.id,
      branchId: user.branchId,
      deviceToken: registeredDeviceToken,
    };
  }

  async login({
    email,
    password,
    fingerprint,
    deviceName,
    userAgent,
    ipAddress,
    deviceToken,
    otp,
    headers = {},
  }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user) {
      logger.warn({ email: normalizedEmail }, 'Login failed: User not found');
      throw new Error('Invalid credentials');
    }

    // Account lockout & IP reputation check (Security Engine)
    await securityEngineService.checkBruteForce(user.id, ipAddress);
    await securityEngineService.evaluateLoginRisk({
      userId: user.id,
      email: normalizedEmail,
      ipAddress,
      userAgent,
      headers,
    });

    if (user.status === 'BLOCKED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: User is blocked');
      throw new Error('Your account has been blocked. Contact support.');
    }

    if (user.status === 'UNVERIFIED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: User email not verified');
      const err = new Error('Please verify your email address before logging in.');
      err.code = AUTH_ERRORS.AUTH_EMAIL_NOT_VERIFIED;
      throw err;
    }

    if (user.status === 'SUSPENDED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: User is suspended');
      throw new Error('Your account has been suspended. Contact support.');
    }

    if (user.tenant?.blacklisted) {
      logger.warn({ email: normalizedEmail }, 'Login failed: Tenant is blacklisted');
      throw new Error('Your organization has been blocked. Contact support.');
    }

    if (user.tenant?.status === 'SUSPENDED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: Tenant is suspended');
      throw new Error('Your organization has been suspended. Contact support.');
    }

    if (user.tenant?.status === 'EXPIRED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: Tenant subscription expired');
      throw new Error('Your subscription has expired. Please renew.');
    }

    const isBcrypt =
      user.password &&
      (user.password.startsWith('$2a$') ||
        user.password.startsWith('$2b$') ||
        user.password.startsWith('$2y$'));
    if (!isBcrypt) {
      logger.error(
        { email: normalizedEmail },
        'Login failed: Password is not bcrypt-hashed. Run the password migration utility.',
      );
      throw new Error('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await securityEngineService.recordFailedLogin({
        userId: user.id,
        email: normalizedEmail,
        ipAddress,
      });
      logger.warn({ email: normalizedEmail }, 'Login failed: Password mismatch');
      throw new Error('Invalid credentials');
    }

    // Successful login — clear failed attempts
    await securityEngineService.clearFailedLogin({ userId: user.id });

    // --- DEVICE BINDING & BROWSER LOCKS VALIDATION ---
    const fingerprintId = fingerprint ? sessionService.hashFingerprint(fingerprint) : null;

    if (fingerprintId) {
      // 1. Browser Lock check: One Browser = One Account
      const existingLock = await prisma.browserLock.findUnique({
        where: { fingerprintId },
      });
      if (existingLock && existingLock.userId !== user.id) {
        throw new Error('This browser is already linked to another account');
      }

      if (deviceToken) {
        const existingDevice = await prisma.device.findUnique({
          where: { deviceToken },
        });
        if (existingDevice && existingDevice.userId !== user.id) {
          throw new Error('This device is already linked to another account');
        }
      }

      // 2. Account Device Binding check: One Account = One Browser / Device
      const userDevices = await prisma.device.findMany({
        where: { userId: user.id },
      });

      // Find if this is a recognized device
      const matchingDevice = userDevices.find(
        (d) => (deviceToken && d.deviceToken === deviceToken) || d.fingerprintId === fingerprintId,
      );

      if (!matchingDevice) {
        // If a new device is attempting to log in, require OTP verification
        if (!otp) {
          const deviceOtp = Math.floor(100000 + Math.random() * 900000).toString();
          const hashedOtp = await bcrypt.hash(deviceOtp, 12);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              resetOtp: hashedOtp,
              resetOtpExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
              resetOtpVerified: false,
            },
          });

          await queueEmail(
            user.email,
            'New Device Login Verification',
            `We detected a login attempt from a new device. Please use the following code to approve this device: ${deviceOtp}`,
          );

          otpAuditService.logOtpGenerated({
            userId: user.id,
            email: user.email,
            otp: deviceOtp,
            purpose: 'DEVICE_VERIFICATION',
            channel: 'EMAIL',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          });

          return {
            deviceVerificationRequired: true,
            message: 'Verification code sent to your email to approve this new device.',
          };
        } else {
          // Verify OTP
          if (!user.resetOtp || !user.resetOtpExpiry || new Date() > user.resetOtpExpiry) {
            otpAuditService.logOtpExpired({
              email: user.email,
              userId: user.id,
              purpose: 'DEVICE_VERIFICATION',
            });
            throw new Error('Verification code has expired or is invalid');
          }

          const isOtpMatch = await bcrypt.compare(otp, user.resetOtp);
          if (!isOtpMatch) {
            otpAuditService.logOtpFailed({
              email: user.email,
              enteredOtp: otp,
              reason: 'INVALID_OTP',
              userId: user.id,
              purpose: 'DEVICE_VERIFICATION',
            });
            throw new Error('Invalid verification code');
          }

          otpAuditService.logOtpVerified({
            email: user.email,
            otp,
            userId: user.id,
            channel: 'EMAIL',
          });

          // Clear OTP fields
          await prisma.user.update({
            where: { id: user.id },
            data: {
              resetOtp: null,
              resetOtpExpiry: null,
              resetOtpVerified: false,
            },
          });

          // Clean/release old devices and old browser locks for this user to enforce "One active device/browser"
          await prisma.device.deleteMany({
            where: { userId: user.id },
          });
          await prisma.browserLock.deleteMany({
            where: { userId: user.id },
          });
        }
      }
    }

    let finalDeviceToken = deviceToken;
    if (!finalDeviceToken) {
      finalDeviceToken = crypto.randomUUID();
    }

    if (fingerprintId) {
      await prisma.device.upsert({
        where: { deviceToken: finalDeviceToken },
        update: {
          lastSeen: new Date(),
          browser: userAgent,
        },
        create: {
          userId: user.id,
          fingerprintId,
          deviceToken: finalDeviceToken,
          browser: userAgent,
        },
      });

      await prisma.browserLock.upsert({
        where: { userId: user.id },
        update: {
          fingerprintId,
        },
        create: {
          fingerprintId,
          userId: user.id,
        },
      });
    }

    const subscription = user.tenant?.subscription;

    if (
      subscription &&
      subscription.status === 'TRIAL' &&
      subscription.endDate &&
      new Date() > subscription.endDate
    ) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });
      subscription.status = 'EXPIRED';
    }

    const jti = sessionService.generateDeviceToken();

    const session = await sessionService.createSession({
      userId: user.id,
      refreshToken: jti,
      fingerprint,
      deviceName,
      userAgent,
      ipAddress,
    });

    const accessToken = this._signAccessToken(user, session.id);
    const signedRefreshToken = this._signRefreshToken(session.id, jti);

    const isExpired = subscription?.status === 'EXPIRED';
    const subscriptionStatus = subscription?.status || 'PENDING';

    await loginHistoryService.recordLoginEvent({
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
    });

    eventBus.publish('UserLoggedIn', {
      userId: user.id,
      tenantId: user.tenantId,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
    });

    return {
      token: accessToken,
      refreshToken: signedRefreshToken,
      deviceToken: finalDeviceToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: MediaService.generatePublicUrl(user.avatar),
        subscriptionStatus,
        currentPeriodEnd: subscription?.endDate,
      },
      ...(isExpired ? { subscriptionExpired: true, redirectTo: '/billing' } : {}),
    };
  }

  async refreshSession(oldRefreshToken) {
    const startTime = Date.now();
    let sessionId = null;
    let jti = null;

    try {
      const payload = jwt.verify(oldRefreshToken, JWT_CONFIG.refreshSecret);
      sessionId = payload.sessionId;
      jti = payload.jti;
      if (payload.authVersion !== CURRENT_AUTH_VERSION) {
        logger.info(
          {
            sessionId,
            fromVersion: payload.authVersion || 'legacy',
            toVersion: CURRENT_AUTH_VERSION,
          },
          'Migrating session authentication version',
        );
      }
    } catch (err) {
      logger.error(err);
      jti = oldRefreshToken;
    }

    const tokenHash = sessionService.hashToken(jti);
    let session;

    if (sessionId) {
      session = await sessionService.findSessionById(sessionId);
    } else {
      session = await sessionService.findSessionByRefreshToken(jti);
    }

    logger.info(
      {
        tokenHash,
        sessionFound: !!session,
        sessionId: session?.id,
        lookupDuration: Date.now() - startTime,
      },
      'Session lookup during refresh',
    );

    if (!session) {
      logger.info({
        route: '/auth/refresh',
        cookieReceived: true,
        sessionFound: false,
        duration: Date.now() - startTime,
      });
      throw new Error('Session not found');
    }

    if (session.revoked) {
      throw new Error('Invalid or reused refresh token');
    }

    if (session.refreshToken !== tokenHash) {
      // REPLAY ATTACK! The session is active but the token presented doesn't match the active hash.
      await sessionService.revokeSession(session.id);
      logger.warn(
        { sessionId: session.id, userId: session.userId, jti },
        'Replay attack detected! Revoked session immediately.',
      );
      throw new Error('Invalid or reused refresh token');
    }

    if (new Date() > session.expiresAt) {
      await sessionService.revokeSession(session.id);
      logger.info({
        route: '/auth/refresh',
        cookieReceived: true,
        sessionFound: true,
        userFound: false,
        duration: Date.now() - startTime,
      });
      throw new Error('Refresh token expired');
    }

    const userLookupStart = Date.now();
    const user = await authRepository.findUserById(session.userId);
    logger.info(
      { userFound: !!user, userLookupDuration: Date.now() - userLookupStart },
      'User lookup during refresh',
    );

    if (!user) {
      logger.info({
        route: '/auth/refresh',
        cookieReceived: true,
        sessionFound: true,
        userFound: false,
        duration: Date.now() - startTime,
      });
      throw new Error('User not found');
    }

    if (user.status === 'BLOCKED') {
      await sessionService.revokeSession(session.id);
      throw new Error('Your account has been blocked. Contact support.');
    }

    if (user.status === 'SUSPENDED') {
      await sessionService.revokeSession(session.id);
      throw new Error('Your account has been suspended. Contact support.');
    }

    if (user.tenant?.blacklisted) {
      await sessionService.revokeSession(session.id);
      throw new Error('Your organization has been blocked. Contact support.');
    }

    if (user.tenant?.status === 'SUSPENDED') {
      await sessionService.revokeSession(session.id);
      throw new Error('Your organization has been suspended. Contact support.');
    }

    if (user.tenant?.status === 'EXPIRED') {
      await sessionService.revokeSession(session.id);
      throw new Error('Your subscription has expired. Please renew.');
    }

    // Rotate Refresh Token
    const newJti = sessionService.generateDeviceToken();
    await sessionService.rotateRefreshToken(session.id, newJti);

    const accessToken = this._signAccessToken(user, session.id);
    const signedRefreshToken = this._signRefreshToken(session.id, newJti);
    const subscription = user.tenant?.subscription;

    if (
      subscription &&
      subscription.status === 'TRIAL' &&
      subscription.endDate &&
      new Date() > subscription.endDate
    ) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'EXPIRED' },
      });
      subscription.status = 'EXPIRED';
    }

    const isExpired = subscription?.status === 'EXPIRED';

    eventBus.publish('RefreshTokenRotated', {
      userId: user.id,
      tenantId: user.tenantId,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
    });

    return {
      token: accessToken,
      refreshToken: signedRefreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: MediaService.generatePublicUrl(user.avatar),
        subscriptionStatus: subscription?.status || 'PENDING',
        currentPeriodEnd: subscription?.endDate,
      },
      ...(isExpired ? { subscriptionExpired: true, redirectTo: '/billing' } : {}),
    };
  }

  async logout(sessionId) {
    if (sessionId) {
      await sessionService.revokeSession(sessionId);
      eventBus.publish('UserLoggedOut', { sessionId, timestamp: new Date().toISOString() });
    }
  }

  async logoutAll(userId) {
    await sessionService.revokeAllUserSessions(userId);
  }

  async getSessions(userId) {
    return sessionService.getActiveSessions(userId);
  }

  async revokeSession(sessionId, userId) {
    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      throw new Error('Session not found');
    }
    await sessionService.revokeSession(sessionId);
  }

  async updateProfile(userId, data) {
    const { fullName, phone, shopName } = data;
    const updateData = {};

    if (fullName !== undefined) {
      const sanitized = fullName.replace(/[<>"'&]/g, '').trim();
      if (sanitized.length < 1 || sanitized.length > 100) {
        throw new Error('Full name must be 1-100 characters');
      }
      updateData.fullName = sanitized;
    }
    if (phone !== undefined) {
      const sanitized = phone.replace(/[^0-9+\-() ]/g, '').trim();
      updateData.phone = sanitized || null;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (shopName !== undefined && user.tenantId) {
      const sanitized = shopName.replace(/[<>"'&]/g, '').trim();
      if (sanitized.length > 0) {
        await prisma.tenant.update({
          where: { id: user.tenantId },
          data: { name: sanitized },
        });
      }
    }

    const { invalidateUserCache } = await import('./auth.cache.js');
    invalidateUserCache(userId);

    return { message: 'Profile updated successfully' };
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.code = AUTH_ERRORS.USER_NOT_FOUND;
      throw err;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      const err = new Error('Current password is incorrect');
      err.code = AUTH_ERRORS.INVALID_PASSWORD;
      throw err;
    }

    PasswordService.validatePasswordPolicy(newPassword);
    await PasswordService.checkPasswordHistory(userId, newPassword, prisma);

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        forcePasswordReset: false,
      },
    });

    await PasswordService.recordPasswordHistory(userId, hashedPassword, prisma);
    await sessionService.revokeAllUserSessions(userId);

    eventBus.publish('PasswordChanged', { userId, timestamp: new Date() });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(email, ipAddress = '') {
    const user = await authRepository.findUserByEmail(email);
    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await bcrypt.hash(otp, 12);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

      await prisma.user.update({
        where: { email },
        data: {
          resetOtp: hashedOtp,
          resetOtpExpiry: expiresAt,
          resetOtpVerified: false,
          resetOtpAttempts: 0,
          resetOtpLastSentAt: new Date(),
          resetToken: null,
          resetTokenExpiry: null,
        },
      });

      await queueEmail(email, 'Password Reset OTP', RESET_OTP_TEMPLATE(otp));

      otpAuditService.logOtpGenerated({
        userId: user.id,
        email,
        otp,
        purpose: 'PASSWORD_RESET',
        channel: 'EMAIL',
        ipAddress,
        expiresAt,
      });
    }
    return { message: 'If the account exists, a recovery code has been sent.' };
  }

  async verifyResetOtp(email, otp, ipAddress = '') {
    const user = await authRepository.findUserByEmail(email);
    if (!user || !user.resetOtp) {
      return { message: 'OTP verified successfully' };
    }

    if (user.resetOtpAttempts >= MAX_OTP_ATTEMPTS) {
      otpAuditService.logOtpFailed({
        email,
        reason: 'MAX_ATTEMPTS',
        attempt: user.resetOtpAttempts,
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        ipAddress,
      });
      const err = new Error('Too many failed attempts. Request a new OTP.');
      err.code = AUTH_ERRORS.OTP_LOCKED;
      throw err;
    }

    if (new Date() > user.resetOtpExpiry) {
      otpAuditService.logOtpExpired({ email, userId: user.id, purpose: 'PASSWORD_RESET' });
      const err = new Error('OTP has expired');
      err.code = AUTH_ERRORS.OTP_EXPIRED;
      throw err;
    }

    const isMatch = await bcrypt.compare(otp, user.resetOtp);
    if (!isMatch) {
      await prisma.user.update({
        where: { email },
        data: { resetOtpAttempts: { increment: 1 } },
      });
      otpAuditService.logOtpFailed({
        email,
        enteredOtp: otp,
        reason: AUTH_ERRORS.INVALID_OTP,
        attempt: user.resetOtpAttempts + 1,
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        ipAddress,
      });
      const err = new Error('Invalid OTP');
      err.code = AUTH_ERRORS.INVALID_OTP;
      throw err;
    }

    const resetToken = jwt.sign(
      { type: 'password-reset', userId: user.id },
      secretManager.getPrimarySecret(),
      { expiresIn: '5m', algorithm: 'HS256' },
    );

    const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await prisma.user.update({
      where: { email },
      data: {
        resetOtpVerified: true,
        resetToken: hashedResetToken,
        resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
      },
    });

    otpAuditService.logOtpVerified({
      email,
      otp,
      userId: user.id,
      channel: 'EMAIL',
      ipAddress,
    });

    return { message: 'OTP verified successfully', resetToken };
  }

  async resetPassword(resetToken, newPassword) {
    let payload;
    try {
      payload = jwt.verify(resetToken, secretManager.getPrimarySecret());
    } catch {
      const err = new Error('Invalid or expired reset token.');
      err.code = AUTH_ERRORS.INVALID_RESET_TOKEN;
      throw err;
    }

    if (payload.type !== 'password-reset' || !payload.userId) {
      const err = new Error('Invalid reset token.');
      err.code = AUTH_ERRORS.INVALID_RESET_TOKEN;
      throw err;
    }

    const user = await authRepository.findUserById(payload.userId);
    if (!user || !user.resetOtpVerified) {
      return { message: 'Password reset successful' };
    }

    if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
      const err = new Error('Reset session expired. Request a new OTP.');
      err.code = AUTH_ERRORS.RESET_SESSION_EXPIRED;
      throw err;
    }

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    if (user.resetToken !== hashedToken) {
      const err = new Error('Invalid reset token.');
      err.code = AUTH_ERRORS.INVALID_RESET_TOKEN;
      throw err;
    }

    PasswordService.validatePasswordPolicy(newPassword);
    await PasswordService.checkPasswordHistory(user.id, newPassword, prisma);

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        forcePasswordReset: false,
        resetOtp: null,
        resetOtpExpiry: null,
        resetOtpVerified: false,
        resetOtpAttempts: 0,
        resetOtpLastSentAt: null,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    await PasswordService.recordPasswordHistory(user.id, hashedPassword, prisma);
    await sessionService.revokeAllUserSessions(user.id);

    eventBus.publish('PasswordReset', { userId: user.id, timestamp: new Date() });

    return { message: 'Password reset successful' };
  }

  async getMe(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const tenant = user.tenant;
    const subscription = tenant?.subscription;
    const plan = subscription?.plan;

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: MediaService.generatePublicUrl(user.avatar),
        subscriptionStatus: subscription?.status || 'PENDING',
        currentPeriodEnd: subscription?.endDate,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            status: tenant.status,
            gstNumber: tenant.gstNumber,
          }
        : null,
      subscription: subscription
        ? (() => {
            const endDate = subscription.endDate;
            const daysRemaining = endDate
              ? Math.max(0, Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24)))
              : 0;
            return {
              planId: plan?.id || null,
              planName: plan?.name || 'Unknown',
              price: plan?.price ?? 0,
              status: subscription.status,
              isTrial: subscription.status === 'TRIAL',
              isExpired: subscription.status === 'EXPIRED',
              expiresAt: endDate,
              daysRemaining,
            };
          })()
        : {
            planId: null,
            planName: 'No Plan',
            price: 0,
            status: 'PENDING',
            isTrial: false,
            isExpired: false,
            expiresAt: null,
            daysRemaining: 0,
          },
    };
  }

  _signAccessToken(user, sessionId) {
    return tokenService.signAccessToken(user, sessionId);
  }

  _signRefreshToken(sessionId, jti) {
    return tokenService.signRefreshToken(sessionId, jti);
  }
}

export default new AuthPrismaService();
