import crypto from 'crypto';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import logger from '../../../shared/utils/logger.js';
import { CSRF_COOKIE_OPTIONS } from '../../../config/cookie.config.js';

const EXEMPT_ROUTES = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/recovery/request',
  '/api/webhooks/stripe',
]);

class CsrfMiddleware {
  /**
   * Generates a cryptographically secure random CSRF token.
   */
  generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Attaches a double-submit readable CSRF cookie to HTTP response.
   */
  setCsrfCookie(reply, token) {
    reply.setCookie('csrf_token', token, CSRF_COOKIE_OPTIONS);
  }

  /**
   * Fastify PreHandler interceptor validating double-submit CSRF tokens.
   */
  async verifyCsrf(request, reply) {
    const method = request.method?.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    const path = request.routerPath || request.raw?.url?.split('?')[0];
    if (EXEMPT_ROUTES.has(path)) {
      return;
    }

    const cookieToken = request.cookies?.csrf_token;
    const headerToken = request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      let reason = 'csrf_mismatch';
      if (!cookieToken) reason = 'csrf_cookie_missing';
      else if (!headerToken) reason = 'csrf_header_missing';

      logger.warn(
        {
          path,
          ip: request.ip,
          reason,
          hasCookie: !!cookieToken,
          hasHeader: !!headerToken,
        },
        'Blocked request: CSRF double-submit validation mismatch',
      );
      return reply.code(403).send({
        success: false,
        reason,
        message: 'CSRF validation failed.',
        code: AUTH_ERRORS.AUTH_INVALID_CSRF,
      });
    }
  }
}

export default new CsrfMiddleware();
