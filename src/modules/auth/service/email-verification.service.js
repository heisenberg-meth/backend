import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from './session.service.js';
import { queueEmail } from '../../../shared/services/email.service.js';
import { CHANGE_EMAIL_TEMPLATE } from '../../notifications/templates/email.templates.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import { EMAIL_CHANGE_EXPIRY_MS } from '../auth.constants.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class EmailVerificationService {
  /**
   * Initiates an email change challenge.
   */
  async requestEmailChange(
    userId,
    newEmail,
    currentPassword,
    frontendUrl = 'http://localhost:5173',
  ) {
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

    const existingUser = await authRepository.findUserByEmail(newEmail);
    if (existingUser) {
      const err = new Error('Email is already in use');
      err.code = 'EMAIL_EXISTS';
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_EXPIRY_MS);

    await prisma.user.update({
      where: { id: userId },
      data: {
        pendingEmail: newEmail,
        emailVerificationToken: hashedToken,
        emailVerificationExpiry: expiresAt,
      },
    });

    const verifyUrl = `${frontendUrl}/confirm-email-change?token=${rawToken}`;
    await queueEmail(
      newEmail,
      'Confirm Your New Email Address',
      CHANGE_EMAIL_TEMPLATE(verifyUrl, newEmail),
    );

    logger.info({ userId, newEmail }, 'Email change verification queued');
    return { message: 'Verification link sent to your new email address.' };
  }

  /**
   * Finalizes email change upon token confirmation.
   */
  async verifyEmailChange(rawToken) {
    if (!rawToken) {
      const err = new Error('Verification token is required');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: hashedToken },
    });

    if (!user || !user.pendingEmail) {
      const err = new Error('Invalid verification token');
      err.code = AUTH_ERRORS.INVALID_VERIFICATION_TOKEN;
      throw err;
    }

    if (!user.emailVerificationExpiry || new Date() > user.emailVerificationExpiry) {
      const err = new Error('Verification token has expired');
      err.code = AUTH_ERRORS.VERIFICATION_TOKEN_EXPIRED;
      throw err;
    }

    const oldEmail = user.email;
    const newEmail = user.pendingEmail;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        pendingEmail: null,
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    await sessionService.revokeAllUserSessions(user.id);

    eventBus.publish('EmailChanged', {
      userId: user.id,
      oldEmail,
      newEmail,
      timestamp: new Date(),
    });
    logger.info({ userId: user.id, oldEmail, newEmail }, 'Email changed successfully');

    return { message: 'Email address updated successfully. Please log in with your new email.' };
  }
}

export default new EmailVerificationService();
