import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from './session.service.js';
import secretManager from '../../../config/secrets.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';
import { TRIAL_DAYS } from '../../subscriptions/subscription.constants.js';
import { queueEmail } from '../../../shared/services/email.service.js';

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

    const hashedPassword = await bcrypt.hash(password, 10);

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
    otp,
  }) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user) {
      logger.warn({ email: normalizedEmail }, 'Login failed: User not found');
      throw new Error('Invalid credentials');
    }

    if (user.status === 'BLOCKED') {
      logger.warn({ email: normalizedEmail }, 'Login failed: User is blocked');
      throw new Error('Your account has been blocked. Contact support.');
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
      logger.warn({ email: normalizedEmail }, 'Login failed: Password mismatch');
      throw new Error('Invalid credentials');
    }

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

      // 2. Account Device Binding check: One Account = One Browser / Device
      const userDevices = await prisma.device.findMany({
        where: { userId: user.id },
      });

      if (userDevices.length > 0) {
        // Find if this is a recognized device
        const matchingDevice = userDevices.find(
          (d) =>
            (deviceToken && d.deviceToken === deviceToken) || d.fingerprintId === fingerprintId,
        );

        if (!matchingDevice) {
          // If a new device is attempting to log in, require OTP verification
          if (!otp) {
            const deviceOtp = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedOtp = await bcrypt.hash(deviceOtp, 10);

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

            return {
              deviceVerificationRequired: true,
              message: 'Verification code sent to your email to approve this new device.',
            };
          } else {
            // Verify OTP
            if (!user.resetOtp || !user.resetOtpExpiry || new Date() > user.resetOtpExpiry) {
              throw new Error('Verification code has expired or is invalid');
            }

            const isOtpMatch = await bcrypt.compare(otp, user.resetOtp);
            if (!isOtpMatch) {
              throw new Error('Invalid verification code');
            }

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
    }

    // If device binding verification passed, or if this is user's first login:
    // Generate/register the device token if not already stored
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
        where: { fingerprintId },
        update: {},
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

    const refreshToken = sessionService.generateDeviceToken();

    const session = await sessionService.createSession({
      userId: user.id,
      refreshToken,
      fingerprint,
      deviceName,
      userAgent,
      ipAddress,
    });

    const accessToken = this._signAccessToken(user, session.id);

    const isExpired = subscription?.status === 'EXPIRED';
    const subscriptionStatus = subscription?.status || 'PENDING';

    return {
      token: accessToken,
      refreshToken,
      deviceToken: finalDeviceToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: user.avatar,
        subscriptionStatus,
        currentPeriodEnd: subscription?.endDate,
      },
      ...(isExpired ? { subscriptionExpired: true, redirectTo: '/billing' } : {}),
    };
  }

  async refreshSession(oldRefreshToken) {
    const tokenHash = sessionService.hashToken(oldRefreshToken);
    const session = await sessionService.findSessionByRefreshToken(oldRefreshToken);

    logger.info(
      {
        tokenHash,
        sessionFound: !!session,
        sessionId: session?.id,
      },
      'Session lookup during refresh',
    );

    if (!session || session.revoked) {
      throw new Error('Invalid or reused refresh token');
    }

    if (new Date() > session.expiresAt) {
      await sessionService.revokeSession(session.id);
      throw new Error('Refresh token expired');
    }

    const user = await authRepository.findUserById(session.userId);
    if (!user) {
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

    const newRefreshToken = sessionService.generateDeviceToken();
    await sessionService.rotateRefreshToken(session.id, newRefreshToken);

    const updated = await prisma.userSession.findUnique({
      where: { id: session.id },
    });

    logger.info(
      {
        sessionId: session.id,
        refreshTokenUpdated: !!updated,
      },
      'Refresh token persistence check',
    );

    const accessToken = this._signAccessToken(user, session.id);
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

    return {
      token: accessToken,
      refreshToken: newRefreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        avatar: user.avatar,
        subscriptionStatus: subscription?.status || 'PENDING',
        currentPeriodEnd: subscription?.endDate,
      },
      ...(isExpired ? { subscriptionExpired: true, redirectTo: '/billing' } : {}),
    };
  }

  async logout(sessionId) {
    if (sessionId) {
      await sessionService.revokeSession(sessionId);
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
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    if (shopName !== undefined && user.tenantId) {
      await prisma.tenant.update({
        where: { id: user.tenantId },
        data: { name: shopName },
      });
    }

    const { invalidateUserCache } = await import('./auth.cache.js');
    invalidateUserCache(userId);

    return { message: 'Profile updated successfully' };
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new Error('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error('Current password is incorrect');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    await sessionService.revokeAllUserSessions(userId);

    return { message: 'Password changed successfully' };
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
        avatar: user.avatar,
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
    return jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        branchId: user.branchId,
        sessionId,
      },
      secretManager.getPrimarySecret(),
      { expiresIn: '15m', algorithm: 'HS256' },
    );
  }
}

export default new AuthPrismaService();
