import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import logger from '../utils/logger.js';

// FIX #03 + #15: Inverted default — OTP logging is OFF unless explicitly opt-in via LOG_OTP=true
// In production this should always remain unset (false).
const LOG_OTP = process.env.LOG_OTP === 'true';

/**
 * Hash an OTP value for safe DB storage using HMAC-SHA256.
 * The raw OTP is never persisted; only a one-way hash is stored.
 * The secret key is the per-deployment ENCRYPTION_KEY so hashes cannot
 * be brute-forced without access to the key.
 */
function hashOtp(otp) {
  if (!otp) return null;
  const key = process.env.ENCRYPTION_KEY || 'fallback-dev-key-not-for-production';
  return crypto.createHmac('sha256', key).update(String(otp)).digest('hex');
}

class OtpAuditService {
  async logOtpGenerated({ userId, email, otp, purpose, channel, ipAddress, expiresAt }) {
    const logPayload = {
      event: 'OTP_GENERATED',
      userId,
      email,
      // Never log the raw OTP value unless explicitly in dev debug mode
      otp: LOG_OTP ? otp : '******',
      purpose,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    logger.info(logPayload, 'OTP Generated');

    await prisma.otpAuditLog.create({
      data: {
        userId,
        email,
        // FIX #03: Store HMAC hash instead of plaintext OTP
        otp: otp ? hashOtp(otp) : null,
        purpose,
        status: 'GENERATED',
        channel,
        ipAddress,
        expiresAt,
      },
    });
  }

  async logOtpVerified({ email, otp, userId, channel, ipAddress }) {
    logger.info(
      {
        event: 'OTP_VERIFIED',
        email,
        otp: LOG_OTP ? otp : '******',
        status: 'SUCCESS',
        verifiedAt: new Date().toISOString(),
      },
      'OTP Verified',
    );

    await prisma.otpAuditLog.create({
      data: {
        userId,
        email,
        otp: otp ? hashOtp(otp) : null,
        purpose: 'VERIFICATION',
        status: 'VERIFIED',
        channel,
        ipAddress,
        verifiedAt: new Date(),
      },
    });
  }

  async logOtpFailed({ email, enteredOtp, reason, attempt, userId, channel, purpose, ipAddress }) {
    logger.warn(
      {
        event: 'OTP_VERIFICATION_FAILED',
        email,
        // Never log the entered OTP in failed attempts either — prevents log harvesting
        enteredOtp: '******',
        reason,
        attempt,
      },
      'OTP Verification Failed',
    );

    await prisma.otpAuditLog.create({
      data: {
        userId,
        email,
        otp: enteredOtp ? hashOtp(enteredOtp) : null,
        purpose: purpose || 'VERIFICATION',
        status: `FAILED_${reason}`,
        channel,
        ipAddress,
      },
    });
  }

  async logOtpExpired({ email, otp, userId, purpose, channel }) {
    logger.info(
      {
        event: 'OTP_EXPIRED',
        email,
        otp: LOG_OTP ? otp : '******',
        expiredAt: new Date().toISOString(),
      },
      'OTP Expired',
    );

    await prisma.otpAuditLog.create({
      data: {
        userId,
        email,
        otp: otp ? hashOtp(otp) : null,
        purpose: purpose || 'VERIFICATION',
        status: 'EXPIRED',
        channel,
      },
    });
  }

  async getLogs({ email, purpose, status, page = 1, limit = 20 }) {
    const where = {};
    if (email) where.email = { contains: email, mode: 'insensitive' };
    if (purpose) where.purpose = purpose;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.otpAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // Never return the hashed OTP field to API consumers
        select: {
          id: true,
          userId: true,
          email: true,
          purpose: true,
          status: true,
          channel: true,
          ipAddress: true,
          expiresAt: true,
          verifiedAt: true,
          createdAt: true,
        },
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.otpAuditLog.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async getLatestByEmail(email) {
    if (!email) throw new Error('Email is required');
    return prisma.otpAuditLog.findFirst({
      where: { email, otp: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        purpose: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }
}

export default new OtpAuditService();
