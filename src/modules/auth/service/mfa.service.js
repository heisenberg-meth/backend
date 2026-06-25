import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import { generateSecret, verifyTOTP } from '../../../shared/utils/totp.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class MfaService {
  /**
   * Initiates MFA enrollment by generating a TOTP secret and QR code.
   */
  async enrollMfa(userId, email, appName = 'Viyan Medassist') {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.code = AUTH_ERRORS.USER_NOT_FOUND;
      throw err;
    }

    const secret = generateSecret();

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
        twoFactorMethod: 'TOTP',
      },
    });

    const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    logger.info({ userId }, 'MFA enrollment initiated');
    return {
      message:
        'Scan the QR code with your authenticator app and enter the 6-digit verification code.',
      secret,
      qrCode: qrCodeUrl,
    };
  }

  /**
   * Finalizes MFA enrollment upon verifying the first TOTP token.
   * Issues 10 single-use backup recovery codes.
   */
  async confirmMfaEnrollment(userId, token) {
    if (!token) {
      const err = new Error('Verification code is required');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, email: true },
    });

    if (!user || !user.twoFactorSecret) {
      const err = new Error('MFA enrollment was not initiated');
      err.code = AUTH_ERRORS.AUTH_MFA_NOT_ENABLED;
      throw err;
    }

    const isValid = verifyTOTP(token, user.twoFactorSecret);
    if (!isValid) {
      const err = new Error('Invalid verification code');
      err.code = AUTH_ERRORS.AUTH_MFA_INVALID;
      throw err;
    }

    // Generate 10 backup codes (e.g., XXXX-XXXX format)
    const plainCodes = [];
    const codeRecords = [];

    for (let i = 0; i < 10; i++) {
      const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      plainCodes.push(code);
      const codeHash = await bcrypt.hash(code, 10);
      codeRecords.push({
        userId,
        codeHash,
        used: false,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });

      await tx.userBackupCode.deleteMany({ where: { userId } });
      await tx.userBackupCode.createMany({ data: codeRecords });
    });

    eventBus.publish('MfaEnabled', { userId, email: user.email, timestamp: new Date() });
    logger.info({ userId }, 'MFA enrollment confirmed successfully');

    return {
      message: 'MFA enabled successfully. Save your backup codes securely.',
      backupCodes: plainCodes,
    };
  }

  /**
   * Verifies an MFA challenge during authentication (TOTP or Backup Code).
   */
  async verifyMfaChallenge(userId, { token, backupCode, fingerprintId, rememberDevice = false }) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { backupCodes: { where: { used: false } } },
    });

    if (!user || !user.twoFactorEnabled) {
      const err = new Error('MFA is not enabled for this account');
      err.code = AUTH_ERRORS.AUTH_MFA_NOT_ENABLED;
      throw err;
    }

    let verified = false;
    let authMethod = 'TOTP';

    if (token) {
      verified = verifyTOTP(token, user.twoFactorSecret);
      if (!verified) {
        const err = new Error('Invalid authentication code');
        err.code = AUTH_ERRORS.AUTH_MFA_INVALID;
        throw err;
      }
    } else if (backupCode) {
      authMethod = 'BACKUP_CODE';
      const cleanCode = backupCode.trim().toUpperCase();
      let matchedRecord = null;

      for (const record of user.backupCodes) {
        const isMatch = await bcrypt.compare(cleanCode, record.codeHash);
        if (isMatch) {
          matchedRecord = record;
          break;
        }
      }

      if (!matchedRecord) {
        const err = new Error('Invalid or already used backup code');
        err.code = AUTH_ERRORS.AUTH_BACKUP_CODE_INVALID;
        throw err;
      }

      await prisma.userBackupCode.update({
        where: { id: matchedRecord.id },
        data: { used: true, usedAt: new Date() },
      });
      verified = true;
    } else {
      const err = new Error('MFA token or backup code required');
      err.code = AUTH_ERRORS.AUTH_MFA_REQUIRED;
      throw err;
    }

    if (rememberDevice && fingerprintId) {
      const trustedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await prisma.device.updateMany({
        where: { userId, fingerprintId },
        data: { isTrusted: true, trustedUntil },
      });
      logger.info({ userId, fingerprintId }, 'Device marked as trusted');
    }

    eventBus.publish('MfaChallengePassed', { userId, authMethod, timestamp: new Date() });
    return { verified: true, authMethod };
  }

  /**
   * Checks if a device is currently trusted for bypassing MFA challenge.
   */
  async isDeviceTrusted(userId, fingerprintId) {
    if (!fingerprintId) return false;
    const device = await prisma.device.findFirst({
      where: {
        userId,
        fingerprintId,
        isTrusted: true,
        trustedUntil: { gt: new Date() },
      },
    });
    return !!device;
  }

  /**
   * Disables MFA for a user upon verifying password.
   */
  async disableMfa(userId, currentPassword) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.code = AUTH_ERRORS.USER_NOT_FOUND;
      throw err;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      const err = new Error('Incorrect password');
      err.code = AUTH_ERRORS.INVALID_PASSWORD;
      throw err;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.userBackupCode.deleteMany({ where: { userId } });
    });

    eventBus.publish('MfaDisabled', { userId, email: user.email, timestamp: new Date() });
    logger.info({ userId }, 'MFA disabled by user');

    return { message: 'Multi-factor authentication has been disabled.' };
  }

  /**
   * Admin override to reset MFA for a locked out user.
   */
  async adminResetMfa(targetUserId, adminId) {
    const user = await authRepository.findUserById(targetUserId);
    if (!user) {
      const err = new Error('Target user not found');
      err.code = AUTH_ERRORS.USER_NOT_FOUND;
      throw err;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });
      await tx.userBackupCode.deleteMany({ where: { userId: targetUserId } });
    });

    eventBus.publish('MfaAdminReset', { targetUserId, adminId, timestamp: new Date() });
    logger.warn({ targetUserId, adminId }, 'MFA administratively reset');

    return { message: `MFA reset successfully for user ${user.email}.` };
  }
}

export default new MfaService();
