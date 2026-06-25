import bcrypt from 'bcryptjs';
import AUTH_ERRORS from '../../../config/auth.errors.js';

/**
 * Enterprise Password Management Service
 * Governs password complexity, history tracking, breach comparison, and expiry policies.
 */

const COMMON_BREACHED_PASSWORDS = new Set([
  'Password123!',
  'Password1!',
  'Admin@123',
  'Admin123!',
  'Welcome123!',
  'Qwerty123!',
  'Medassist123!',
  'Viyan@123',
]);

export class PasswordService {
  /**
   * Enforces enterprise password complexity and breach checks.
   * @param {string} password
   */
  static validatePasswordPolicy(password) {
    if (!password || typeof password !== 'string') {
      const err = new Error('Password is required.');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    if (password.length < 8) {
      const err = new Error('Password must be at least 8 characters long.');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      const err = new Error(
        'Password must include uppercase, lowercase, digits, and special characters.',
      );
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    if (COMMON_BREACHED_PASSWORDS.has(password)) {
      const err = new Error(
        'This password has appeared in known data breaches. Please choose a more unique password.',
      );
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    return true;
  }

  /**
   * Checks if the proposed password matches any of the user's last 5 passwords.
   * @param {string} userId
   * @param {string} newPasswordPlain
   * @param {object} prisma
   */
  static async checkPasswordHistory(userId, newPasswordPlain, prisma) {
    if (!prisma.userPasswordHistory) return; // Fallback if model not migrated yet

    const history = await prisma.userPasswordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const record of history) {
      const isMatch = await bcrypt.compare(newPasswordPlain, record.password);
      if (isMatch) {
        const err = new Error('You cannot reuse any of your last 5 passwords.');
        err.code = AUTH_ERRORS.VALIDATION_ERROR;
        throw err;
      }
    }
  }

  /**
   * Records a password hash in the history table and prunes old records beyond the last 5.
   * @param {string} userId
   * @param {string} hashedPassword
   * @param {object} prisma
   */
  static async recordPasswordHistory(userId, hashedPassword, prisma) {
    if (!prisma.userPasswordHistory) return;

    await prisma.userPasswordHistory.create({
      data: { userId, password: hashedPassword },
    });

    const count = await prisma.userPasswordHistory.count({ where: { userId } });
    if (count > 5) {
      const allRecords = await prisma.userPasswordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      const toDelete = allRecords.slice(5).map((r) => r.id);
      await prisma.userPasswordHistory.deleteMany({
        where: { id: { in: toDelete } },
      });
    }
  }

  /**
   * Evaluates whether a user's password has expired or been flagged for mandatory reset.
   * @param {object} user
   * @param {number} maxAgeDays Default 90 days
   */
  static checkPasswordExpiry(user, maxAgeDays = 90) {
    if (user.forcePasswordReset) {
      const err = new Error('An administrative password reset is required for this account.');
      err.code = AUTH_ERRORS.PASSWORD_CHANGE_ERROR;
      throw err;
    }

    if (user.passwordChangedAt) {
      const ageMs = Date.now() - new Date(user.passwordChangedAt).getTime();
      const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
      if (ageMs > maxAgeMs) {
        const err = new Error(
          'Your password has expired. Please update your password to continue.',
        );
        err.code = AUTH_ERRORS.TOKEN_EXPIRED;
        throw err;
      }
    }
  }
}

export default PasswordService;
