import prisma from '../../config/prisma.js';
import logger from '../utils/logger.js';

const LOG_OTP = process.env.LOG_OTP !== 'false';

class OtpAuditService {
  async logOtpGenerated({ userId, email, otp, purpose, channel, ipAddress, expiresAt }) {
    const logPayload = {
      event: 'OTP_GENERATED',
      userId,
      email,
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
        otp: LOG_OTP ? otp : null,
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
        otp: LOG_OTP ? otp : null,
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
        enteredOtp,
        reason,
        attempt,
      },
      'OTP Verification Failed',
    );

    await prisma.otpAuditLog.create({
      data: {
        userId,
        email,
        otp: enteredOtp,
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
        otp: LOG_OTP ? otp : null,
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
    });
  }
}

export default new OtpAuditService();
