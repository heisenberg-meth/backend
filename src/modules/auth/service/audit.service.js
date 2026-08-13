import logger from '../../../shared/utils/logger.js';

const AuthEvents = {
  LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  LOGIN_FAILURE: 'AUTH_LOGIN_FAILURE',
  REFRESH_SUCCESS: 'AUTH_REFRESH_SUCCESS',
  REFRESH_FAILURE: 'AUTH_REFRESH_FAILURE',
  LOGOUT: 'AUTH_LOGOUT',
  SESSION_CREATED: 'AUTH_SESSION_CREATED',
  SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  TOKEN_REPLAY: 'AUTH_TOKEN_REPLAY',
  PASSWORD_RESET: 'AUTH_PASSWORD_RESET',
};

export default class AuthAuditService {
  /**
   * Logs a standardized authentication event
   * @param {Object} params
   * @param {string} params.event - Event type from AuthEvents
   * @param {string} [params.userId] - ID of the user
   * @param {string} [params.tenantId] - ID of the tenant
   * @param {string} [params.branchId] - ID of the branch
   * @param {string} [params.sessionId] - ID of the session
   * @param {string} [params.requestId] - Fastify request ID
   * @param {string} [params.correlationId] - Optional correlation ID
   * @param {string} [params.clientIp] - Client IP address
   * @param {string} [params.userAgent] - Client User Agent
   * @param {string} [params.status] - SUCCESS or FAILURE
   * @param {Object} [params.metadata] - Additional safe metadata (e.g., token hashes, rotation info)
   */
  logEvent(params) {
    const {
      event,
      userId,
      tenantId,
      branchId,
      sessionId,
      requestId,
      correlationId,
      clientIp,
      userAgent,
      status = 'SUCCESS',
      metadata = {},
    } = params;

    const auditRecord = {
      event,
      userId: userId || null,
      tenantId: tenantId || null,
      branchId: branchId || null,
      sessionId: sessionId || null,
      requestId: requestId || null,
      correlationId: correlationId || requestId || null,
      timestamp: new Date().toISOString(),
      clientIp: clientIp || null,
      userAgent: userAgent || null,
      status,
      ...metadata,
    };

    if (status === 'FAILURE' || event === AuthEvents.TOKEN_REPLAY) {
      logger.warn(auditRecord, `Audit Event: ${event}`);
    } else {
      logger.info(auditRecord, `Audit Event: ${event}`);
    }
  }

  logLoginSuccess({ user, session, loginMethod = 'password', context = {} }) {
    this.logEvent({
      event: AuthEvents.LOGIN_SUCCESS,
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      sessionId: session.id,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'SUCCESS',
      metadata: { loginMethod },
    });
  }

  logLoginFailure({ email, reason, context = {} }) {
    this.logEvent({
      event: AuthEvents.LOGIN_FAILURE,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'FAILURE',
      metadata: { email, reason },
    });
  }

  logRefreshSuccess({ session, previousTokenHash, newTokenHash, context = {} }) {
    this.logEvent({
      event: AuthEvents.REFRESH_SUCCESS,
      userId: session.userId,
      tenantId: session.tenantId,
      sessionId: session.id,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'SUCCESS',
      metadata: {
        previousTokenHash,
        newTokenHash,
        rotationStatus: 'SUCCESS',
      },
    });
  }

  logRefreshFailure({ sessionId, reason, metadata = {}, context = {} }) {
    this.logEvent({
      event: AuthEvents.REFRESH_FAILURE,
      sessionId: sessionId || null,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'FAILURE',
      metadata: { reason, ...metadata },
    });
  }

  logLogout({ session, reason = 'USER_INITIATED', context = {} }) {
    this.logEvent({
      event: AuthEvents.LOGOUT,
      userId: session?.userId,
      tenantId: session?.tenantId,
      sessionId: session?.id,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'SUCCESS',
      metadata: { reason },
    });
  }

  logSessionCreated({ session, context = {} }) {
    this.logEvent({
      event: AuthEvents.SESSION_CREATED,
      userId: session.userId,
      tenantId: session.tenantId,
      sessionId: session.id,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'SUCCESS',
    });
  }

  logSessionExpired({ session, context = {} }) {
    this.logEvent({
      event: AuthEvents.SESSION_EXPIRED,
      userId: session.userId,
      tenantId: session.tenantId,
      sessionId: session.id,
      requestId: context.requestId,
      status: 'SUCCESS',
    });
  }

  logSessionRevoked({ session, reason, context = {} }) {
    this.logEvent({
      event: AuthEvents.SESSION_REVOKED,
      userId: session?.userId,
      tenantId: session?.tenantId,
      sessionId: session?.id,
      requestId: context.requestId,
      status: 'SUCCESS',
      metadata: { reason },
    });
  }

  logTokenReplay({ session, tokenHash, context = {} }) {
    this.logEvent({
      event: AuthEvents.TOKEN_REPLAY,
      userId: session?.userId,
      tenantId: session?.tenantId,
      sessionId: session?.id,
      requestId: context.requestId,
      clientIp: context.ipAddress,
      userAgent: context.userAgent,
      status: 'FAILURE',
      metadata: { tokenHash, reason: 'Reused refresh token' },
    });
  }
}
