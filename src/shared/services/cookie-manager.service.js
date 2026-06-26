import logger from '../utils/logger.js';
import env from '../../config/env.js';
import {
  REFRESH_COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE_OPTIONS,
  CLEAR_COOKIE_OPTIONS,
  CSRF_COOKIE_OPTIONS,
  COOKIE_NAMES,
  resolvedCookieDomain,
} from '../../config/cookie.config.js';

class CookieManager {
  validateConfiguration() {
    logger.info('Validating Cookie Configuration Matrix...');
    const errors = [];

    if (env.nodeEnv === 'production') {
      if (!env.cookieDomain || env.cookieDomain === 'localhost') {
        errors.push(`Invalid domain "${env.cookieDomain}" for production. Must be explicit.`);
      }
      if (!REFRESH_COOKIE_OPTIONS.secure) {
        errors.push('Secure flag MUST be true in production.');
      }
      if (REFRESH_COOKIE_OPTIONS.sameSite !== 'none') {
        errors.push('SameSite MUST be "none" in production for cross-subdomain access.');
      }
    } else if (env.nodeEnv === 'staging') {
      if (!REFRESH_COOKIE_OPTIONS.secure) {
        errors.push('Secure flag MUST be true in staging.');
      }
      if (REFRESH_COOKIE_OPTIONS.sameSite !== 'none') {
        errors.push('SameSite MUST be "none" in staging for cross-subdomain access.');
      }
    } else {
      // development
      if (REFRESH_COOKIE_OPTIONS.secure) {
        logger.warn(
          'Cookie configuration uses Secure=true in development. This may break local testing if not using HTTPS.',
        );
      }
    }

    if (errors.length > 0) {
      logger.error({ errors }, 'Cookie Configuration Matrix is INVALID.');
      throw new Error(`Cookie Configuration Invalid: ${errors.join('; ')}`);
    }

    logger.info('Cookie Configuration Matrix is VALID.');
  }

  _clearLegacyCookies(reply, cookieNames) {
    const currentDomain = resolvedCookieDomain;

    for (const name of cookieNames) {
      // Clear for explicit current domain
      if (currentDomain) {
        reply.clearCookie(name, {
          path: '/',
          domain: currentDomain,
          secure: true,
          sameSite: 'none',
        });
      }

      // Clear host-only cookie (no domain)
      reply.clearCookie(name, { path: '/', secure: true, sameSite: 'none' });
    }

    logger.info(
      {
        event: 'COOKIE_CLEANUP',
        cookieNames,
        currentDomain: currentDomain || 'none',
      },
      'Cookie cleanup completed',
    );
  }

  setAuthCookies(reply, { accessToken, refreshToken }) {
    // 1. Prevent duplicate active cookies
    this._clearLegacyCookies(reply, [COOKIE_NAMES.ACCESS_TOKEN, COOKIE_NAMES.REFRESH_TOKEN]);

    // 2. Set new cookies using consistent exact configuration
    if (refreshToken) {
      reply.setCookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, REFRESH_COOKIE_OPTIONS);
    }
    if (accessToken) {
      reply.setCookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, ACCESS_COOKIE_OPTIONS);
    }

    logger.info(
      {
        event: 'COOKIE_SYNCHRONIZED',
        type: 'auth',
        domain: resolvedCookieDomain || 'none',
        environment: env.nodeEnv,
      },
      'Authentication cookies synchronized with browser',
    );
  }

  clearAuthCookies(reply) {
    reply.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, CLEAR_COOKIE_OPTIONS);
    reply.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, CLEAR_COOKIE_OPTIONS);
    reply.clearCookie(COOKIE_NAMES.CSRF_TOKEN, CLEAR_COOKIE_OPTIONS);
    this._clearLegacyCookies(reply, [COOKIE_NAMES.ACCESS_TOKEN, COOKIE_NAMES.REFRESH_TOKEN]);

    logger.info(
      {
        event: 'COOKIE_CLEARED',
        type: 'auth',
      },
      'Authentication cookies cleared from browser',
    );
  }

  setCsrfCookie(reply, token) {
    reply.setCookie(COOKIE_NAMES.CSRF_TOKEN, token, CSRF_COOKIE_OPTIONS);
  }

  clearCsrfCookie(reply) {
    reply.clearCookie(COOKIE_NAMES.CSRF_TOKEN, CLEAR_COOKIE_OPTIONS);
  }

  setAdminAuthCookies(reply, { accessToken, refreshToken }) {
    this._clearLegacyCookies(reply, [
      COOKIE_NAMES.ADMIN_ACCESS_TOKEN,
      COOKIE_NAMES.ADMIN_REFRESH_TOKEN,
    ]);

    if (refreshToken) {
      reply.setCookie(COOKIE_NAMES.ADMIN_REFRESH_TOKEN, refreshToken, ADMIN_REFRESH_COOKIE_OPTIONS);
    }
    if (accessToken) {
      reply.setCookie(COOKIE_NAMES.ADMIN_ACCESS_TOKEN, accessToken, ADMIN_ACCESS_COOKIE_OPTIONS);
    }

    logger.info(
      {
        event: 'COOKIE_SYNCHRONIZED',
        type: 'admin',
        environment: env.nodeEnv,
      },
      'Admin auth cookies synchronized with browser',
    );
  }

  clearAdminAuthCookies(reply) {
    reply.clearCookie(COOKIE_NAMES.ADMIN_REFRESH_TOKEN, CLEAR_COOKIE_OPTIONS);
    reply.clearCookie(COOKIE_NAMES.ADMIN_ACCESS_TOKEN, CLEAR_COOKIE_OPTIONS);
    this._clearLegacyCookies(reply, [
      COOKIE_NAMES.ADMIN_ACCESS_TOKEN,
      COOKIE_NAMES.ADMIN_REFRESH_TOKEN,
    ]);
  }
}

export default new CookieManager();
