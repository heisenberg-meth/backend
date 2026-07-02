import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from './session.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';
import { TRIAL_DAYS } from '../../subscriptions/subscription.constants.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import otpAuditService from '../../../shared/services/otp-audit.service.js';
import MediaService from '../../../shared/services/media.service.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';
import tokenService from './token.service.js';
import AuthAuditService from './audit.service.js';
import loginHistoryService from './login-history.service.js';
import securityEngineService from './security-engine.service.js';
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
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
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
    headers = {},
  }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(normalizedEmail);
    const context = { ipAddress, userAgent, requestId: headers['x-request-id'] || null };

    if (!user) {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'User not found',
        context,
      });
      // FIX #12: Perform dummy bcrypt compare to equalize response time whether the
      // user exists or not. Without this, an attacker can enumerate valid emails
      // by measuring the response latency difference.
      await bcrypt.compare(
        password,
        '$2b$12$invalidhashfortimingprotectiononly000000000000000000000000',
      );
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
      AuthAuditService.logLoginFailure({ email: normalizedEmail, reason: 'User blocked', context });
      throw new Error('Your account has been blocked. Contact support.');
    }

    if (user.status === 'SUSPENDED') {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'User suspended',
        context,
      });
      throw new Error('Your account has been suspended. Contact support.');
    }

    if (user.tenant?.blacklisted) {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'Tenant blacklisted',
        context,
      });
      throw new Error('Your organization has been blocked. Contact support.');
    }

    if (user.tenant?.status === 'SUSPENDED') {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'Tenant suspended',
        context,
      });
      throw new Error('Your organization has been suspended. Contact support.');
    }

    if (user.tenant?.status === 'EXPIRED') {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'Tenant expired',
        context,
      });
      throw new Error('Your subscription has expired. Please renew.');
    }

    const isBcrypt =
      user.password &&
      (user.password.startsWith('$2a$') ||
        user.password.startsWith('$2b$') ||
        user.password.startsWith('$2y$'));
    if (!isBcrypt) {
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'Invalid password format (legacy)',
        context,
      });
      throw new Error('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      await securityEngineService.recordFailedLogin({
        userId: user.id,
        email: normalizedEmail,
        ipAddress,
      });
      AuthAuditService.logLoginFailure({
        email: normalizedEmail,
        reason: 'Password mismatch',
        context,
      });
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
        // Clean/release old devices and old browser locks for this user to enforce "One active device/browser"
        await prisma.device.deleteMany({
          where: { userId: user.id },
        });
        await prisma.browserLock.deleteMany({
          where: { userId: user.id },
        });
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

    AuthAuditService.logSessionCreated({ session, context });
    const accessToken = tokenService.signAccessToken(user, session.id);
    const signedRefreshToken = tokenService.signRefreshToken(session.id, jti);

    const isExpired = subscription?.status === 'EXPIRED';
    const subscriptionStatus = subscription?.status || 'PENDING';

    await loginHistoryService.recordLoginEvent({
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
    });

    AuthAuditService.logLoginSuccess({
      user,
      session,
      loginMethod: 'password',
      context,
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

  async refreshSession(oldRefreshToken, context = {}) {
    let sessionId = null;
    let jti = null;

    try {
      const payload = tokenService.verifyRefreshToken(oldRefreshToken);
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

    if (!session) {
      AuthAuditService.logRefreshFailure({
        sessionId: sessionId || null,
        reason: 'Session not found',
        context,
      });
      throw new Error('Session not found');
    }

    if (session.revoked) {
      AuthAuditService.logRefreshFailure({
        sessionId: session.id,
        reason: 'Invalid or reused refresh token',
        context,
      });
      throw new Error('Invalid or reused refresh token');
    }

    if (session.refreshToken !== tokenHash) {
      // Allow a 30-second grace period for concurrent refresh requests before revoking
      const isGracePeriod =
        session.lastActivity && new Date() - new Date(session.lastActivity) < 30000;

      if (!isGracePeriod) {
        // REPLAY ATTACK! The session is active but the token presented doesn't match the active hash.
        await sessionService.revokeSession(session.id);
        AuthAuditService.logTokenReplay({ session, tokenHash: oldRefreshToken, context });
      } else {
        logger.warn(
          { sessionId: session.id },
          'Concurrent refresh token request ignored due to grace period',
        );
      }
      throw new Error('Invalid or reused refresh token');
    }

    if (new Date() > session.expiresAt) {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionExpired({ session, context });
      AuthAuditService.logRefreshFailure({
        sessionId: session.id,
        reason: 'Refresh token expired',
        context,
      });
      throw new Error('Refresh token expired');
    }

    const user = await authRepository.findUserById(session.userId);

    if (!user) {
      AuthAuditService.logRefreshFailure({
        sessionId: session.id,
        reason: 'User not found',
        context,
      });
      throw new Error('User not found');
    }

    if (user.status === 'BLOCKED') {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionRevoked({ session, reason: 'Account blocked', context });
      throw new Error('Your account has been blocked. Contact support.');
    }

    if (user.status === 'SUSPENDED') {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionRevoked({ session, reason: 'Account suspended', context });
      throw new Error('Your account has been suspended. Contact support.');
    }

    if (user.tenant?.blacklisted) {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionRevoked({ session, reason: 'Organization blocked', context });
      throw new Error('Your organization has been blocked. Contact support.');
    }

    if (user.tenant?.status === 'SUSPENDED') {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionRevoked({ session, reason: 'Organization suspended', context });
      throw new Error('Your organization has been suspended. Contact support.');
    }

    if (user.tenant?.status === 'EXPIRED') {
      await sessionService.revokeSession(session.id);
      AuthAuditService.logSessionRevoked({ session, reason: 'Subscription expired', context });
      throw new Error('Your subscription has expired. Please renew.');
    }

    // Rotate Refresh Token
    const newJti = sessionService.generateDeviceToken();
    await sessionService.rotateRefreshToken(session.id, newJti);

    const accessToken = tokenService.signAccessToken(user, session.id);
    const signedRefreshToken = tokenService.signRefreshToken(session.id, newJti);
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

    AuthAuditService.logRefreshSuccess({
      session,
      previousTokenHash: tokenHash,
      newTokenHash: sessionService.hashToken(newJti),
      context,
    });

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

  async logout(sessionId, context = {}) {
    if (sessionId) {
      const session = await sessionService.findSessionById(sessionId);
      await sessionService.revokeSession(sessionId);
      if (session) {
        AuthAuditService.logLogout({ session, reason: 'USER_INITIATED', context });
      }
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
    if (data.avatar !== undefined) {
      updateData.avatar = data.avatar;
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

    const resetToken = tokenService.signPasswordResetToken(user.id);

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
      payload = tokenService.verifyPasswordResetToken(resetToken);
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
            const isTrial = subscription.status === 'TRIAL';
            const endDate = isTrial
              ? subscription.trialExpiresAt || subscription.endDate
              : subscription.endDate;
            const daysRemaining = endDate
              ? Math.max(0, Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24)))
              : 0;
            const effectiveStatus =
              (subscription.status === 'TRIAL' || subscription.status === 'ACTIVE') &&
              daysRemaining === 0
                ? 'EXPIRED'
                : subscription.status;
            return {
              planId: plan?.id || null,
              planName: plan?.name || 'Unknown',
              price: plan?.price ?? 0,
              status: effectiveStatus,
              isTrial: effectiveStatus === 'TRIAL',
              isExpired: effectiveStatus === 'EXPIRED',
              expiresAt: endDate,
              trialStartedAt: subscription.trialStartedAt,
              trialExpiresAt: subscription.trialExpiresAt,
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
}

export default new AuthPrismaService();
