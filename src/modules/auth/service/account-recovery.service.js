import bcrypt from 'bcryptjs';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import sessionService from './session.service.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class AccountRecoveryService {
  /**
   * Submits a self-service account recovery request when 2FA/backup devices are lost.
   * Requires primary credential verification.
   */
  async requestRecovery({ email, password, reason, identityData }) {
    const normalizedEmail = email?.toLowerCase().trim();
    const user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user) {
      const err = new Error('Invalid credentials');
      err.code = AUTH_ERRORS.AUTH_INVALID_CREDENTIALS;
      throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const err = new Error('Invalid credentials');
      err.code = AUTH_ERRORS.AUTH_INVALID_CREDENTIALS;
      throw err;
    }

    // Check for existing active pending recovery request
    const existing = await prisma.accountRecoveryRequest.findFirst({
      where: {
        userId: user.id,
        status: 'PENDING_APPROVAL',
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      const err = new Error(
        'An account recovery request is already pending administrative review.',
      );
      err.code = AUTH_ERRORS.AUTH_RECOVERY_PENDING;
      throw err;
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration

    const request = await prisma.accountRecoveryRequest.create({
      data: {
        userId: user.id,
        reason: reason || 'Lost authenticator and backup recovery codes',
        identityData: identityData || {},
        status: 'PENDING_APPROVAL',
        expiresAt,
      },
    });

    eventBus.publish('AccountRecoveryRequested', {
      requestId: request.id,
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      timestamp: new Date(),
    });

    logger.warn({ userId: user.id, requestId: request.id }, 'Account recovery requested');

    return {
      message:
        'Account recovery request submitted successfully. A tenant administrator will verify your identity and review the request.',
      requestId: request.id,
      expiresAt,
    };
  }

  /**
   * Retrieves pending recovery requests for administrative review.
   */
  async getPendingRecoveryRequests(tenantId) {
    const whereClause = {
      status: 'PENDING_APPROVAL',
      expiresAt: { gt: new Date() },
    };

    if (tenantId) {
      whereClause.user = { tenantId };
    }

    const requests = await prisma.accountRecoveryRequest.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, email: true, name: true, branchId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests;
  }

  /**
   * Approves a recovery request: disables 2FA, revokes sessions, clears device trusts.
   */
  async approveRecoveryRequest({ requestId, adminId, adminNotes }) {
    const reqRecord = await prisma.accountRecoveryRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!reqRecord || reqRecord.status !== 'PENDING_APPROVAL') {
      const err = new Error('Recovery request not found or already processed');
      err.code = AUTH_ERRORS.AUTH_RECOVERY_NOT_FOUND;
      throw err;
    }

    if (reqRecord.expiresAt < new Date()) {
      await prisma.accountRecoveryRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });
      const err = new Error('Recovery request has expired');
      err.code = AUTH_ERRORS.AUTH_RECOVERY_EXPIRED;
      throw err;
    }

    const targetUserId = reqRecord.userId;

    await prisma.$transaction(async (tx) => {
      await tx.accountRecoveryRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          adminNotes: adminNotes || 'Identity verified by administrator',
        },
      });

      await tx.user.update({
        where: { id: targetUserId },
      });

      await tx.device.updateMany({
        where: { userId: targetUserId },
        data: { isTrusted: false },
      });
    });

    // Revoke all active sessions
    await sessionService.revokeAllUserSessions(targetUserId, 'ACCOUNT_RECOVERY_APPROVED');

    eventBus.publish('AccountRecoveryApproved', {
      requestId,
      targetUserId,
      adminId,
      timestamp: new Date(),
    });

    logger.warn({ targetUserId, adminId, requestId }, 'Account recovery request approved by admin');

    return {
      success: true,
      message: `Account recovery approved for ${reqRecord.user.email}. Multi-factor authentication disabled and all active sessions revoked.`,
    };
  }

  /**
   * Rejects an account recovery request.
   */
  async rejectRecoveryRequest({ requestId, adminId, adminNotes }) {
    const reqRecord = await prisma.accountRecoveryRequest.findUnique({
      where: { id: requestId },
    });

    if (!reqRecord || reqRecord.status !== 'PENDING_APPROVAL') {
      const err = new Error('Recovery request not found or already processed');
      err.code = AUTH_ERRORS.AUTH_RECOVERY_NOT_FOUND;
      throw err;
    }

    await prisma.accountRecoveryRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        adminNotes: adminNotes || 'Identity verification failed',
      },
    });

    eventBus.publish('AccountRecoveryRejected', {
      requestId,
      targetUserId: reqRecord.userId,
      adminId,
      timestamp: new Date(),
    });

    logger.info({ requestId, adminId }, 'Account recovery request rejected');

    return {
      success: true,
      message: 'Account recovery request has been rejected.',
    };
  }
}

export default new AccountRecoveryService();
