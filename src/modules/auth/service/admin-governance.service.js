import prisma from '../../../config/prisma.js';
import redis from '../../../config/redis.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import sessionService from './session.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

const DEFAULT_AUTH_POLICY = {
  passwordMinLength: 10,
  requireUppercase: true,
  requireNumbers: true,
  requireSymbols: true,
  mfaRequired: false,
  sessionIdleTimeoutMinutes: 30,
  maxSessionDurationHours: 24,
  jitProvisioningEnabled: true,
};

class AdminGovernanceService {
  /**
   * Retrieves tenant-specific authentication and security governance policies.
   */
  async getTenantAuthPolicy(tenantId) {
    if (!tenantId) return DEFAULT_AUTH_POLICY;

    const cacheKey = `auth:policy:tenant:${tenantId}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        logger.error({ error: e }, 'Failed to parse cached auth policy');
      }
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const config = settings?.customConfig || {};
    const policy = { ...DEFAULT_AUTH_POLICY, ...(config.authPolicy || {}) };

    await redis.setex(cacheKey, 3600, JSON.stringify(policy)).catch(() => {});
    return policy;
  }

  /**
   * Updates tenant authentication security policy.
   */
  async updateTenantAuthPolicy(tenantId, policyUpdates) {
    if (!tenantId) throw new Error('Tenant ID is required');

    const currentPolicy = await this.getTenantAuthPolicy(tenantId);
    const updatedPolicy = { ...currentPolicy, ...policyUpdates };

    const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
    const existingConfig = settings?.customConfig || {};

    await prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        customConfig: { ...existingConfig, authPolicy: updatedPolicy },
      },
      create: {
        tenantId,
        customConfig: { authPolicy: updatedPolicy },
      },
    });

    const cacheKey = `auth:policy:tenant:${tenantId}`;
    await redis.del(cacheKey).catch(() => {});

    logger.info({ tenantId, updatedPolicy }, 'Tenant Auth Governance Policy updated');
    eventBus.publish('TenantAuthPolicyUpdated', { tenantId, updatedPolicy, timestamp: new Date() });

    return updatedPolicy;
  }

  /**
   * IT Administrator override: Revokes and resets a user's lost MFA credentials.
   */
  async adminResetUserMfa({ adminUserId, targetUserId, tenantId }) {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, tenantId },
    });

    if (!targetUser) {
      const err = new Error('Target user not found within administrator tenant scope');
      err.code = AUTH_ERRORS.AUTH_UNAUTHORIZED;
      throw err;
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetUserId },
        data: { twoFactorEnabled: false },
      }),
      prisma.userBackupCode.deleteMany({
        where: { userId: targetUserId },
      }),
    ]);

    // Terminate active sessions to force re-authentication
    await sessionService.revokeAllUserSessions(targetUserId);

    logger.warn({ adminUserId, targetUserId, tenantId }, 'Admin override: User MFA reset');
    eventBus.publish('AdminUserMfaReset', {
      adminUserId,
      targetUserId,
      tenantId,
      timestamp: new Date(),
    });

    return { success: true, message: 'User multi-factor authentication reset successfully.' };
  }

  /**
   * IT Administrator override: Forces user password reset and revokes sessions.
   */
  async adminForcePasswordReset({ adminUserId, targetUserId, tenantId }) {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, tenantId },
    });

    if (!targetUser) {
      throw new Error('Target user not found within administrator scope');
    }

    // Revoke all sessions immediately
    await sessionService.revokeAllUserSessions(targetUserId);

    // Set user status to UNVERIFIED to force password reset challenge
    await prisma.user.update({
      where: { id: targetUserId },
      data: { status: 'UNVERIFIED' },
    });

    logger.warn(
      { adminUserId, targetUserId, tenantId },
      'Admin override: Forced user password reset',
    );
    eventBus.publish('AdminForcedPasswordReset', {
      adminUserId,
      targetUserId,
      email: targetUser.email,
      tenantId,
      timestamp: new Date(),
    });

    return { success: true, message: 'User sessions revoked and password reset enforced.' };
  }

  /**
   * IT Administrator override: Instant session termination across all devices.
   */
  async adminTerminateUserSessions({ adminUserId, targetUserId, tenantId }) {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, tenantId },
    });

    if (!targetUser) throw new Error('Target user not found');

    const revokedCount = await sessionService.revokeAllUserSessions(targetUserId);

    logger.info({ adminUserId, targetUserId, revokedCount }, 'Admin session termination executed');
    eventBus.publish('AdminUserSessionsTerminated', {
      adminUserId,
      targetUserId,
      timestamp: new Date(),
    });

    return { success: true, revokedSessions: revokedCount };
  }
}

export default new AdminGovernanceService();
