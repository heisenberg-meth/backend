import prisma from '../../../config/prisma.js';
import sessionService from './session.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class ComplianceService {
  /**
   * GDPR Article 20: Exports complete identity and authentication data portability package.
   */
  async exportUserData(userId) {
    if (!userId) throw new Error('User ID is required');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        tenantId: true,
        branchId: true,
        twoFactorEnabled: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new Error('User not found');

    const [loginHistory, recoveryRequests] = await Promise.all([
      prisma.loginHistory.findMany({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      }),
      prisma.accountRecoveryRequest.findMany({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
      }),
    ]);

    const activeSessions = await sessionService.listUserSessions(userId).catch(() => []);

    logger.info({ userId }, 'GDPR user data export package generated');
    eventBus.publish('ComplianceDataExported', {
      userId,
      tenantId: user.tenantId,
      timestamp: new Date(),
    });

    return {
      exportVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      complianceStandard: 'GDPR Article 20 (Right to Data Portability)',
      identity: user,
      activeSessions,
      loginForensics: loginHistory,
      accountRecoveryHistory: recoveryRequests,
    };
  }

  /**
   * GDPR Article 17: Right to be Forgotten deletion and PII anonymization cascade.
   */
  async deleteUserData({ userId, tenantId, reason = 'User requested GDPR erasure' }) {
    if (!userId) throw new Error('User ID is required');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    // Revoke all active sessions
    await sessionService.revokeAllUserSessions(userId);

    // Anonymize User table PII
    const anonymizedEmail = `gdpr_erased_${userId}@anonymized.viyaninfo.com`;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          name: 'Anonymized User',
          password: 'gdpr_purged_bcrypt_hash_placeholder',
          twoFactorEnabled: false,
          status: 'BLOCKED',
        },
      }),
      prisma.userBackupCode.deleteMany({ where: { userId } }),
      prisma.accountRecoveryRequest.deleteMany({ where: { userId } }),
    ]);

    logger.warn({ userId, tenantId, reason }, 'GDPR Right to be Forgotten erasure executed');

    // Emit tamper-evident immutable audit log telemetry
    eventBus.publish('GdprRightToBeForgottenExecuted', {
      originalUserId: userId,
      tenantId: user.tenantId,
      reason,
      erasedAt: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'User identity anonymized and authentication credentials purged.',
      anonymizedId: userId,
    };
  }
}

export default new ComplianceService();
