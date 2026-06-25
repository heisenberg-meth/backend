import logger from '../../../shared/utils/logger.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';
import { resolvedCookieDomain, REFRESH_COOKIE_OPTIONS } from '../../../config/cookie.config.js';

class AuthMetricsService {
  constructor() {
    this.metrics = {
      login: { success: 0, failure: 0, invalidPassword: 0, lockedAccount: 0 },
      refresh: { success: 0, failure: 0, replayAttack: 0, expiredToken: 0 },
      logout: { success: 0, failure: 0 },
      sessions: { activeSessions: 0, revokedSessions: 0, expiredSessions: 0 },
      cookies: { issued: 0, cleared: 0, rejected: 0, invalid: 0, migrated: 0 },
    };
  }

  recordLoginSuccess() {
    this.metrics.login.success++;
  }

  recordLoginFailure(reason) {
    this.metrics.login.failure++;
    if (reason === 'invalid_password') this.metrics.login.invalidPassword++;
    if (reason === 'locked' || reason === 'blocked') this.metrics.login.lockedAccount++;
  }

  recordRefreshSuccess() {
    this.metrics.refresh.success++;
  }

  recordRefreshFailure(reason) {
    this.metrics.refresh.failure++;
    if (reason === 'replay') this.metrics.refresh.replayAttack++;
    if (reason === 'expired') this.metrics.refresh.expiredToken++;
  }

  recordLogoutSuccess() {
    this.metrics.logout.success++;
  }

  recordLogoutFailure() {
    this.metrics.logout.failure++;
  }

  recordCookieIssued() {
    this.metrics.cookies.issued++;
  }

  recordCookieCleared() {
    this.metrics.cookies.cleared++;
  }

  recordCookieRejected() {
    this.metrics.cookies.rejected++;
  }

  recordCookieInvalid() {
    this.metrics.cookies.invalid++;
  }

  recordCookieMigration() {
    this.metrics.cookies.migrated++;
  }

  getMetrics() {
    const totalLogins = this.metrics.login.success + this.metrics.login.failure;
    const totalRefreshes = this.metrics.refresh.success + this.metrics.refresh.failure;

    return {
      raw: this.metrics,
      dashboard: {
        authentication: {
          loginSuccessRate:
            totalLogins > 0
              ? ((this.metrics.login.success / totalLogins) * 100).toFixed(2) + '%'
              : '100%',
          refreshSuccessRate:
            totalRefreshes > 0
              ? ((this.metrics.refresh.success / totalRefreshes) * 100).toFixed(2) + '%'
              : '100%',
          failedLogins: this.metrics.login.failure,
          replayAttempts: this.metrics.refresh.replayAttack,
          cookieErrors: this.metrics.cookies.rejected + this.metrics.cookies.invalid,
        },
        sessions: {
          activeSessions: this.metrics.sessions.activeSessions,
          revokedSessions: this.metrics.sessions.revokedSessions,
          expiredSessions: this.metrics.sessions.expiredSessions,
        },
        deployment: {
          currentAuthVersion: CURRENT_AUTH_VERSION,
          cookieDomain: resolvedCookieDomain || 'none',
          cookieMigrations: this.metrics.cookies.migrated,
        },
      },
    };
  }

  logStructuredAuthEvent({
    requestId,
    correlationId,
    method,
    endpoint,
    userId,
    tenantId,
    branchId,
    role,
    sessionId,
    result,
    errorCode,
    failureReason,
    responseTime,
    ipAddress,
    userAgent,
  }) {
    logger.info(
      {
        event: 'AUTH_AUDIT_LOG',
        requestInfo: {
          requestId: requestId || null,
          correlationId: correlationId || requestId || null,
          timestamp: new Date().toISOString(),
          endpoint,
          httpMethod: method || null,
        },
        userContext: {
          userId: userId || null,
          tenantId: tenantId || null,
          branchId: branchId || null,
          role: role || null,
          sessionId: sessionId || null,
        },
        clientContext: {
          userAgent: userAgent || null,
          clientIp: ipAddress || null,
        },
        authContext: {
          authVersion: CURRENT_AUTH_VERSION,
          cookieDomain: resolvedCookieDomain || null,
          sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
          secureFlag: REFRESH_COOKIE_OPTIONS.secure,
        },
        result: {
          status: result,
          errorCode: errorCode || null,
          failureReason: failureReason || null,
          responseTimeMs: responseTime || null,
        },
      },
      `[AUTH_AUDIT] ${method || 'POST'} ${endpoint} -> ${result}${errorCode ? ` (${errorCode})` : ''}`,
    );
  }

  logDeploymentEvent({ action, version, engineer, result, details }) {
    logger.info(
      {
        event: 'AUTH_DEPLOYMENT_AUDIT',
        timestamp: new Date().toISOString(),
        action,
        authVersion: version || CURRENT_AUTH_VERSION,
        engineer: engineer || 'system',
        result: result || 'success',
        details: details || null,
      },
      `[DEPLOYMENT_AUDIT] ${action} -> ${result} (v${version || CURRENT_AUTH_VERSION})`,
    );
  }
}

export default new AuthMetricsService();
