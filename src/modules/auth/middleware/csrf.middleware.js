import crypto from 'crypto';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import logger from '../../../shared/utils/logger.js';

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
    reply.setCookie('csrf_token', token, {
      path: '/',
      httpOnly: false, // SPA client needs to read document.cookie
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
      domain: process.env.COOKIE_DOMAIN || undefined,
    });
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
      logger.warn(
        { path, ip: request.ip },
        'Blocked request: CSRF double-submit validation mismatch',
      );
      return reply.code(403).send({
        success: false,
        error: 'Invalid or missing CSRF token',
        code: AUTH_ERRORS.AUTH_INVALID_CSRF,
      });
    }
  }
}

export default new CsrfMiddleware();
